import { loadResults, saveResults } from "./api.js";
import {
  STATUS_LABELS,
  STATUS_MARKS,
  adjacentTest,
  collectTestIds,
  countByPriority,
  countStatuses,
  displayStatus,
  emptyResultsDoc,
  extractImportedResults,
  firstWorkItem,
  flattenTestCases,
  formatFailureReport,
  getResult,
  matchesQuery,
  nextWorkItem,
  overwriteRisk,
  remainingCount,
  resetResults,
  runOutcome,
  upsertResult,
  validateDefinitions,
} from "./schema.js";

const state = {
  definitions: null,
  results: emptyResultsDoc(),
  query: "",
  status: "all",
  priority: "all",
  view: "all",
  sectionId: "",
  activeTestId: "",
  sync: "loading",
  message: "",
  collapsed: new Set(),
  lastError: "",
};

let saveTimer = 0;
let saving = false;
let queued = false;
let modalResolver = null;

const els = {
  title: document.getElementById("app-title"),
  sync: document.getElementById("sync-status"),
  savedAt: document.getElementById("saved-at"),
  banner: document.getElementById("banner"),
  complete: document.getElementById("complete-banner"),
  runPill: document.getElementById("run-complete-label"),
  views: document.getElementById("run-views"),
  summary: document.getElementById("progress-summary"),
  prioritySummary: document.getElementById("priority-summary"),
  bar: document.getElementById("progress-bar"),
  counts: document.getElementById("progress-counts"),
  nextCard: document.getElementById("next-card"),
  quick: document.getElementById("quick-filters"),
  activeFilters: document.getElementById("active-filters"),
  sidebar: document.getElementById("sidebar"),
  search: document.getElementById("search"),
  main: document.getElementById("main"),
  detail: document.getElementById("detail"),
  mobileBar: document.getElementById("mobile-bar"),
  more: document.getElementById("btn-more"),
  moreMenu: document.getElementById("more-menu"),
  keysModal: document.getElementById("keys-modal"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalCancel: document.getElementById("modal-cancel"),
  modalExtra: document.getElementById("modal-extra"),
  modalConfirm: document.getElementById("modal-confirm"),
  importFile: document.getElementById("import-file"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRelative(value) {
  if (!value) return "No results saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "Last saved just now";
  if (seconds < 60) return `Last saved ${seconds} seconds ago`;
  if (seconds < 3600) return `Last saved ${Math.max(1, Math.round(seconds / 60))} min ago`;
  return `Last saved ${date.toLocaleTimeString()}`;
}

function badge(status) {
  const shown = displayStatus(status);
  return `<span class="badge ${shown}">${STATUS_MARKS[shown]} ${escapeHtml(STATUS_LABELS[shown])}</span>`;
}

function setSync(sync, message = "") {
  state.sync = sync;
  state.message = message;
  const labels = {
    loading: "Loading…",
    saving: "Saving…",
    saved: "Saved",
    failed: "Save failed",
    offline: "Offline / unable to sync",
  };
  els.sync.dataset.state = sync;
  els.sync.textContent = message || labels[sync] || sync;
  els.savedAt.textContent = formatRelative(state.results.updatedAt);
}

function showBanner(html) {
  if (!html) {
    els.banner.hidden = true;
    els.banner.innerHTML = "";
    return;
  }
  els.banner.hidden = false;
  els.banner.innerHTML = html;
}

function confirmAction(title, body, confirmLabel = "Confirm", extraLabel = "") {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = body;
  els.modalConfirm.textContent = confirmLabel;
  els.modalExtra.hidden = !extraLabel;
  els.modalExtra.textContent = extraLabel;
  els.modal.hidden = false;
  els.modalConfirm.focus();
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function closeModal(result) {
  els.modal.hidden = true;
  const resolve = modalResolver;
  modalResolver = null;
  if (resolve) resolve(result);
}

function allTests() {
  return flattenTestCases(state.definitions);
}

function visibleTests() {
  return allTests().filter((test) =>
    matchesQuery(test, getResult(state.results, test.id), {
      query: state.query,
      status: state.status,
      priority: state.priority,
      view: state.view,
      sectionId: state.sectionId,
    })
  );
}

function findTest(id) {
  return allTests().find((test) => test.id === id) || null;
}

function caseUrl(id) {
  return `${location.origin}${location.pathname}#${encodeURIComponent(id)}`;
}

function selectTest(id, { scrollList = true } = {}) {
  state.activeTestId = id || "";
  if (id) {
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    if (scrollList) {
      const row = els.main.querySelector(`[data-test="${CSS.escape(id)}"]`);
      row?.scrollIntoView({ block: "nearest" });
    }
  }
  renderDetail();
  highlightRows();
  renderMobileBar();
}

function continueTesting() {
  const next = firstWorkItem(state.definitions, state.results);
  if (!next) {
    state.view = "all";
    state.sectionId = "";
    render();
    return;
  }
  state.view = "todo";
  state.sectionId = "";
  state.status = "all";
  render();
  selectTest(next.id);
}

function applyStatus(ids, status, extra = {}) {
  let next = state.results;
  for (const id of ids) {
    const patch = { status, ...extra };
    if (status !== "failed") {
      patch.error = "";
      patch.errorDetails = "";
      patch.actualResult = "";
    }
    next = upsertResult(next, id, patch);
  }
  state.results = next;
  const currentId = ids.length === 1 ? ids[0] : state.activeTestId;
  if ((status === "passed" || status === "skipped") && currentId) {
    const following = nextWorkItem(state.definitions, state.results, currentId);
    render();
    if (following) selectTest(following.id);
    persist();
    return;
  }
  render();
  if (currentId) selectTest(currentId, { scrollList: false });
  persist();
}

async function persist() {
  if (saving) {
    queued = true;
    return;
  }
  saving = true;
  setSync("saving");
  showBanner("");
  try {
    const saved = await saveResults(state.results);
    state.results.revision = saved.revision;
    state.results.updatedAt = saved.updatedAt;
    setSync("saved");
  } catch (error) {
    if (error.status === 409 && error.data?.current) {
      const overwrite = await confirmAction(
        "Newer results exist",
        "Another tab or session saved first. Reload to keep the server copy, or overwrite it with this browser’s results.",
        "Overwrite server"
      );
      if (overwrite === true) {
        state.results.revision = error.data.current.revision;
        saving = false;
        await persist();
        return;
      }
      state.results = error.data.current;
      setSync("saved", "Loaded newer server results");
      render();
      return;
    }
    state.lastError = error.message || "The Cloudflare KV request failed.";
    setSync(navigator.onLine === false ? "offline" : "failed");
    showBanner(`
      <strong>Unable to save test result.</strong>
      <p>${escapeHtml(state.lastError)} Your current changes are still available locally.</p>
      <div class="banner__actions"><button type="button" id="retry-save">Retry Save</button></div>
    `);
  } finally {
    saving = false;
    if (queued) {
      queued = false;
      persist();
    }
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persist(), 450);
}

function exportResults() {
  const payload = {
    exportedAt: new Date().toISOString(),
    title: state.definitions?.title || "",
    revision: state.results.revision,
    updatedAt: state.results.updatedAt,
    results: state.results.results,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `offload-test-results-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function maybeOverwrite(filter, actionLabel) {
  const risk = overwriteRisk(state.definitions, state.results, filter);
  if (!risk.existing) return true;
  return (
    (await confirmAction(
      "Overwrite existing results?",
      `${actionLabel} will replace ${risk.existing} existing result(s), including ${risk.failed} failed test(s) and ${risk.withDetails} with notes or error details.`,
      "Overwrite"
    )) === true
  );
}

function renderOverview() {
  const counts = countStatuses(state.definitions, state.results);
  const remaining = remainingCount(counts);
  const outcome = runOutcome(counts);
  const priorities = countByPriority(state.definitions, state.results);
  els.summary.textContent = `${counts.resolved} / ${counts.total} completed · ${remaining} remaining`;
  els.bar.style.width = `${counts.resolvedPercent}%`;
  els.bar.setAttribute("aria-valuenow", String(counts.resolvedPercent));
  els.bar.setAttribute("aria-valuemin", "0");
  els.bar.setAttribute("aria-valuemax", "100");
  els.runPill.textContent = remaining ? `${counts.resolvedPercent}%` : outcome === "passed" ? "Run passed" : "Run failed";
  els.prioritySummary.textContent = ["P0", "P1"]
    .filter((key) => priorities[key])
    .map((key) => `${key}: ${priorities[key].completed} / ${priorities[key].total}`)
    .join("   ");

  const cards = [
    ["passed", counts.passed],
    ["failed", counts.failed],
    ["blocked", counts.blocked],
    ["skipped", counts.skipped],
    ["not_tested", counts.not_tested],
    ["in_progress", counts.in_progress],
  ];
  els.counts.innerHTML = cards
    .map(
      ([status, value]) =>
        `<li><button type="button" class="${status}" data-view="${status === "not_tested" || status === "in_progress" ? "todo" : status}" aria-pressed="${state.view === status || ((status === "not_tested" || status === "in_progress") && state.view === "todo")}"><strong>${value}</strong>${escapeHtml(STATUS_LABELS[status])}</button></li>`
    )
    .join("");

  const next = firstWorkItem(state.definitions, state.results);
  document.getElementById("btn-continue").hidden = !next;
  if (!next) {
    els.nextCard.hidden = true;
    els.nextCard.innerHTML = "";
  } else {
    els.nextCard.hidden = false;
    els.nextCard.innerHTML = `
      <div>
        <strong>Continue testing</strong>
        <p>${escapeHtml(next.id)} · ${escapeHtml(next.priority || "")} · ${escapeHtml(next.sectionTitle)}${next.subsectionTitle ? ` → ${escapeHtml(next.subsectionTitle)}` : ""}</p>
        <p class="muted">${escapeHtml(next.title)}</p>
      </div>
      <button type="button" class="primary" data-continue>Continue →</button>`;
  }

  els.views.innerHTML = [
    ["all", `All tests`],
    ["failed", `Failed (${counts.failed})`],
    ["blocked", `Blocked (${counts.blocked})`],
    ["todo", `TODO (${remaining})`],
  ]
    .map(
      ([view, label]) =>
        `<button type="button" data-view="${view}" aria-pressed="${state.view === view}">${escapeHtml(label)}</button>`
    )
    .join("");

  els.quick.innerHTML = [
    ["view", "all", "All"],
    ["priority", "P0", "P0"],
    ["priority", "P1", "P1"],
    ["view", "failed", "Failed"],
    ["view", "blocked", "Blocked"],
    ["view", "todo", "TODO"],
  ]
    .map(([kind, value, label]) => {
      const pressed = kind === "priority" ? state.priority === value : state.view === value;
      return `<button type="button" class="chip" data-${kind}="${value}" aria-pressed="${pressed}">${label}</button>`;
    })
    .join("");

  const chips = [];
  if (state.view !== "all") chips.push(["view", `Status: ${state.view === "todo" ? "TODO" : STATUS_LABELS[state.view] || state.view}`]);
  if (state.priority !== "all") chips.push(["priority", `Priority: ${state.priority}`]);
  if (state.sectionId) {
    const section = state.definitions.sections.find((item) => item.id === state.sectionId);
    chips.push(["section", `Section: ${section?.title || state.sectionId}`]);
  }
  els.activeFilters.innerHTML = chips
    .map(([kind, label]) => `<button type="button" data-clear="${kind}">${escapeHtml(label)} ×</button>`)
    .join("");

  if (remaining === 0) {
    els.complete.hidden = false;
    els.complete.className = `complete ${outcome === "failed" ? "is-failed" : ""}`;
    els.complete.innerHTML = `
      <h2>Test run complete</h2>
      <p>${counts.total} / ${counts.total} tests completed</p>
      <p>✓ ${counts.passed} Passed · ✕ ${counts.failed} Failed · ! ${counts.blocked} Blocked · — ${counts.skipped} Skipped</p>
      <p><strong>Overall result: ${outcome === "passed" ? "PASSED" : "FAILED"}</strong></p>
      <div class="complete__actions">
        <button type="button" data-view="failed">View failures</button>
        <button type="button" id="btn-export-complete">Export JSON</button>
        <button type="button" id="btn-reset-complete" class="danger">Restart run</button>
      </div>`;
  } else {
    els.complete.hidden = true;
    els.complete.innerHTML = "";
  }
}

function renderSidebar() {
  const active = findTest(state.activeTestId);
  const map = Array.isArray(state.definitions.pageMap) ? state.definitions.pageMap : [];
  const howto = state.definitions.description
    ? `<details class="howto"><summary>How to run this pass</summary><p class="muted">${escapeHtml(state.definitions.description)}</p>${map
        .map((item) => `<p><strong>${escapeHtml(item.screen)}</strong><br><span class="muted">${escapeHtml(item.path)}</span>${item.url ? `<br><code>${escapeHtml(item.url)}</code>` : ""}</p>`)
        .join("")}</details>`
    : "";
  els.sidebar.innerHTML = `<h2>Test sections</h2>${state.definitions.sections
    .map((section) => {
      const counts = countStatuses({ sections: [section] }, state.results);
      const remaining = remainingCount(counts);
      const mark = counts.failed ? "✕" : remaining === 0 ? "✓" : active?.sectionId === section.id ? "●" : "○";
      const current = remaining > 0 && remaining < counts.total;
      return `<button type="button" class="nav-section ${state.sectionId === section.id ? "is-active" : ""} ${remaining === 0 ? "is-done" : ""} ${current ? "is-current" : ""} ${counts.failed ? "is-failed" : ""}" data-section="${escapeHtml(section.id)}">
        <span class="mark">${mark}</span>
        <span>${escapeHtml(section.title)}<small>${counts.resolved} / ${counts.total}</small></span>
        <span class="muted">${counts.resolvedPercent}%</span>
        <span class="mini-bar"><span style="width:${counts.resolvedPercent}%"></span></span>
      </button>`;
    })
    .join("")}${howto}`;
}

function renderList() {
  const grouped = new Map();
  for (const test of visibleTests()) {
    if (!grouped.has(test.sectionId)) grouped.set(test.sectionId, []);
    grouped.get(test.sectionId).push(test);
  }
  if (!grouped.size) {
    els.main.innerHTML = `<p class="empty">No test cases match this filter.</p>`;
    return;
  }

  els.main.innerHTML = state.definitions.sections
    .map((section) => {
      const tests = grouped.get(section.id);
      if (!tests) return "";
      const counts = countStatuses({ sections: [section] }, state.results);
      const collapsed = state.collapsed.has(section.id);
      const subsections = Array.isArray(section.subsections) ? section.subsections : [];
      const body = collapsed
        ? ""
        : `<div class="section__body">
            ${subsections
              .map((subsection) => {
                const rows = tests.filter((test) => test.subsectionId === subsection.id);
                if (!rows.length) return "";
                return `<p class="subsection-label">${escapeHtml(subsection.title)}</p>${rows.map(renderRow).join("")}`;
              })
              .join("")}
            ${tests.filter((test) => !test.subsectionId).map(renderRow).join("")}
          </div>`;
      return `<section class="section" id="section-${escapeHtml(section.id)}">
        <div class="section__head">
          <button type="button" data-collapse="${escapeHtml(section.id)}" class="section__grow">
            <h3>${escapeHtml(section.title)}</h3>
            <p class="meta">${counts.resolved} / ${counts.total} · ${counts.resolvedPercent}% · ${counts.failed} failed · ${remainingCount(counts)} remaining</p>
          </button>
          <select data-bulk data-section="${escapeHtml(section.id)}">
            <option value="">Section actions</option>
            <option value="passed">Mark section passed</option>
            <option value="skipped">Mark section skipped</option>
            <option value="reset">Restart section</option>
          </select>
        </div>
        ${body}
      </section>`;
    })
    .join("");
}

function renderRow(test) {
  const result = getResult(state.results, test.id);
  const status = displayStatus(result.status);
  return `<button type="button" class="test-row is-${status}${state.activeTestId === test.id ? " is-active" : ""}" data-test="${escapeHtml(test.id)}">
    ${badge(status)}
    <span>
      <span class="id">${escapeHtml(test.id)}${test.priority ? ` <span class="prio ${escapeHtml(test.priority.toLowerCase())}">${escapeHtml(test.priority)}</span>` : ""}</span>
      <h4>${escapeHtml(test.title)}</h4>
    </span>
  </button>`;
}

function renderDetail() {
  const test = findTest(state.activeTestId);
  const visible = visibleTests();
  if (!test) {
    const next = firstWorkItem(state.definitions, state.results);
    els.detail.innerHTML = next
      ? `<h2>Execute</h2><p class="muted">Select a case, or continue with the next untested item.</p><p><strong>${escapeHtml(next.id)}</strong><br>${escapeHtml(next.title)}</p><button type="button" class="primary" data-continue>Continue testing</button>`
      : `<h2>Execute</h2><p class="muted">All remaining work is done. Review failures or export a snapshot.</p>`;
    return;
  }

  const result = getResult(state.results, test.id);
  const status = displayStatus(result.status);
  const index = Math.max(0, visible.findIndex((item) => item.id === test.id));
  const failure = status === "failed"
    ? `<div class="failure-box">
        <label class="field"><span>Severity</span>
          <select data-field="severity" data-id="${escapeHtml(test.id)}">
            ${["", "Blocker", "Critical", "Major", "Minor"].map((item) => `<option value="${item}" ${result.severity === item ? "selected" : ""}>${item || "Select…"}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Error message</span><input data-field="error" data-id="${escapeHtml(test.id)}" value="${escapeHtml(result.error)}" /></label>
        <label class="field"><span>Error details</span><textarea data-field="errorDetails" data-id="${escapeHtml(test.id)}">${escapeHtml(result.errorDetails)}</textarea></label>
        <label class="field"><span>Expected</span><textarea data-field="expectedResult" data-id="${escapeHtml(test.id)}">${escapeHtml(result.expectedResult || test.expectedResult)}</textarea></label>
        <label class="field"><span>Actual</span><textarea data-field="actualResult" data-id="${escapeHtml(test.id)}">${escapeHtml(result.actualResult)}</textarea></label>
        <button type="button" data-copy-failure="${escapeHtml(test.id)}">Copy failure report</button>
      </div>`
    : "";

  els.detail.innerHTML = `
    <div class="detail__nav">
      <button type="button" data-step="-1">← Previous</button>
      <span>${visible.length ? index + 1 : 0} / ${visible.length || allTests().length}</span>
      <button type="button" data-step="1">Next →</button>
    </div>
    <div class="detail__head">
      <div>
        <p class="id">${escapeHtml(test.id)}</p>
        <h3>${escapeHtml(test.title)}</h3>
        <p class="muted">${escapeHtml(test.sectionTitle)}${test.subsectionTitle ? ` → ${escapeHtml(test.subsectionTitle)}` : ""}</p>
      </div>
      ${badge(status)}
    </div>
    ${test.priority ? `<p><span class="prio ${escapeHtml(test.priority.toLowerCase())}">${escapeHtml(test.priority)}</span></p>` : ""}
    <dl class="spec">
      ${test.where ? `<div class="spec__row"><dt>Where</dt><dd>${escapeHtml(test.where)}</dd></div>` : ""}
      ${test.url ? `<div class="spec__row"><dt>URL</dt><dd><code>${escapeHtml(test.url)}</code></dd></div>` : ""}
      ${test.given ? `<div class="spec__row given"><dt>Given</dt><dd>${escapeHtml(test.given)}</dd></div>` : ""}
      ${test.when ? `<div class="spec__row when"><dt>When</dt><dd>${escapeHtml(test.when)}</dd></div>` : ""}
      ${test.then || test.expectedResult ? `<div class="spec__row then"><dt>Then</dt><dd>${escapeHtml(test.then || test.expectedResult)}</dd></div>` : ""}
    </dl>
    <div class="status-actions">
      ${["passed", "failed", "blocked", "skipped"].map((item) => `<button type="button" data-status="${item}" data-id="${escapeHtml(test.id)}" aria-pressed="${status === item}">${escapeHtml(STATUS_LABELS[item])}</button>`).join("")}
    </div>
    <p class="muted"><button type="button" data-next-untested>Next untested →</button> <button type="button" data-copy-link="${escapeHtml(test.id)}">Copy link</button></p>
    ${failure}
    <label class="field"><span>Tester notes</span><textarea data-field="notes" data-id="${escapeHtml(test.id)}">${escapeHtml(result.notes)}</textarea></label>
    <label class="field"><span>Additional comments</span><textarea data-field="comments" data-id="${escapeHtml(test.id)}">${escapeHtml(result.comments)}</textarea></label>
    <p class="muted">Updated ${escapeHtml(formatTime(result.updatedAt) || "—")}</p>
  `;
}

function renderMobileBar() {
  const test = findTest(state.activeTestId);
  const narrow = window.matchMedia("(max-width: 1099px)").matches;
  if (!test || !narrow) {
    els.mobileBar.hidden = true;
    els.mobileBar.innerHTML = "";
    return;
  }
  els.mobileBar.hidden = false;
  els.mobileBar.innerHTML = `
    <button type="button" data-step="-1">←</button>
    <button type="button" class="primary" data-status="passed" data-id="${escapeHtml(test.id)}">Pass</button>
    <button type="button" class="danger" data-status="failed" data-id="${escapeHtml(test.id)}">Fail</button>
    <button type="button" data-step="1">→</button>`;
}

function highlightRows() {
  els.main.querySelectorAll("[data-test]").forEach((row) => {
    row.classList.toggle("is-active", row.dataset.test === state.activeTestId);
  });
}

function render() {
  if (!state.definitions) return;
  els.title.textContent = state.definitions.title || "Offload Test Cases";
  document.title = state.definitions.title || "Offload Test Cases";
  renderOverview();
  renderSidebar();
  renderList();
  renderDetail();
  renderMobileBar();
}

async function loadDefinitions() {
  const response = await fetch("/data/test-cases.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load test-cases.json from the site.");
  const data = await response.json();
  const checked = validateDefinitions(data);
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  state.definitions = data;
}

async function refreshResults({ quiet = false } = {}) {
  const results = await loadResults();
  state.results = results;
  if (!quiet) setSync("saved");
  render();
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (id && findTest(id)) selectTest(id, { scrollList: true });
}

async function start() {
  try {
    await loadDefinitions();
    await refreshResults({ quiet: true });
    setSync("saved");
    if (!state.results.updatedAt) els.savedAt.textContent = "No results saved yet";
    openFromHash();
  } catch (error) {
    setSync("failed", error.message);
    showBanner(`<strong>Unable to load test data.</strong><p>${escapeHtml(error.message)}</p>`);
  }
}

function setView(view) {
  state.view = view;
  if (view !== "all") state.status = "all";
  render();
}

document.getElementById("btn-refresh").addEventListener("click", async () => {
  try {
    await refreshResults();
    showBanner("");
  } catch (error) {
    setSync("failed", error.message);
    showBanner(`<strong>Refresh failed.</strong><p>${escapeHtml(error.message)}</p>`);
  }
});

document.getElementById("btn-continue").addEventListener("click", continueTesting);
document.getElementById("btn-export").addEventListener("click", exportResults);
document.getElementById("btn-import").addEventListener("click", () => els.importFile.click());
document.getElementById("btn-keys").addEventListener("click", () => {
  els.keysModal.hidden = false;
  els.moreMenu.hidden = true;
});
document.getElementById("keys-close").addEventListener("click", () => {
  els.keysModal.hidden = true;
});
els.keysModal.addEventListener("click", (event) => {
  if (event.target === els.keysModal) els.keysModal.hidden = true;
});

els.more.addEventListener("click", () => {
  const open = els.moreMenu.hidden;
  els.moreMenu.hidden = !open;
  els.more.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".more")) {
    els.moreMenu.hidden = true;
    els.more.setAttribute("aria-expanded", "false");
  }
});

els.importFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showBanner("<strong>Import failed.</strong><p>The selected file is not valid JSON. Existing results were not changed.</p>");
    return;
  }
  const imported = extractImportedResults(parsed);
  if (!imported.ok) {
    showBanner(`<strong>Import failed.</strong><p>${escapeHtml(imported.errors.join(" "))} Existing results were not changed.</p>`);
    return;
  }
  const ok = await confirmAction(
    "Replace current results?",
    "Import will replace the results currently stored in KV. Test case definitions in the repo will not change.",
    "Import"
  );
  if (ok !== true) return;
  state.results = {
    ...state.results,
    results: imported.value.results,
  };
  render();
  persist();
});

document.getElementById("btn-reset-all").addEventListener("click", async () => {
  await restartAll();
});

async function restartAll() {
  const risk = overwriteRisk(state.definitions, state.results);
  const choice = await confirmAction(
    "Restart full test?",
    risk.existing
      ? `This will reset all ${risk.ids.length} test results (${risk.existing} existing). Definitions stay in the repo. This cannot be undone unless you export a snapshot first.`
      : "This clears KV results. Test case definitions stay in the repo.",
    "Restart",
    "Export JSON first"
  );
  if (choice === "export") {
    exportResults();
    return;
  }
  if (choice !== true) return;
  state.results = resetResults(state.results, null);
  render();
  persist();
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

document.getElementById("btn-expand-all").addEventListener("click", () => {
  state.collapsed.clear();
  render();
});

document.getElementById("btn-collapse-all").addEventListener("click", () => {
  for (const section of state.definitions.sections) state.collapsed.add(section.id);
  render();
});

els.views.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(button.dataset.view);
});

els.counts.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(state.view === button.dataset.view ? "all" : button.dataset.view);
});

els.quick.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]");
  const priority = event.target.closest("[data-priority]");
  if (view) {
    if (view.dataset.view === "all") {
      state.view = "all";
      state.priority = "all";
      state.sectionId = "";
      render();
      return;
    }
    setView(state.view === view.dataset.view ? "all" : view.dataset.view);
    return;
  }
  if (priority) {
    const next = priority.dataset.priority;
    state.priority = state.priority === next ? "all" : next;
    render();
  }
});

els.activeFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-clear]");
  if (!button) return;
  if (button.dataset.clear === "view") state.view = "all";
  if (button.dataset.clear === "priority") state.priority = "all";
  if (button.dataset.clear === "section") state.sectionId = "";
  render();
});

els.complete.addEventListener("click", (event) => {
  if (event.target.id === "btn-export-complete") exportResults();
  if (event.target.id === "btn-reset-complete") restartAll();
  const view = event.target.closest("[data-view]");
  if (view) setView(view.dataset.view);
});

els.nextCard.addEventListener("click", (event) => {
  if (event.target.closest("[data-continue]")) continueTesting();
});

els.sidebar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-section]");
  if (!button) return;
  state.sectionId = state.sectionId === button.dataset.section ? "" : button.dataset.section;
  render();
});

function handleWorkspaceClick(event) {
  if (event.target.closest("[data-continue]")) {
    continueTesting();
    return;
  }
  const nextUntested = event.target.closest("[data-next-untested]");
  if (nextUntested) {
    const next = nextWorkItem(state.definitions, state.results, state.activeTestId) || firstWorkItem(state.definitions, state.results);
    if (next) selectTest(next.id);
    return;
  }
  const copyLink = event.target.closest("[data-copy-link]");
  if (copyLink) {
    navigator.clipboard?.writeText(caseUrl(copyLink.dataset.copyLink));
    return;
  }
  const copyFailure = event.target.closest("[data-copy-failure]");
  if (copyFailure) {
    const test = findTest(copyFailure.dataset.copyFailure);
    if (test) navigator.clipboard?.writeText(formatFailureReport(test, getResult(state.results, test.id)));
    return;
  }
  const step = event.target.closest("[data-step]");
  if (step) {
    const next = adjacentTest(visibleTests(), state.activeTestId, Number(step.dataset.step));
    if (next) selectTest(next.id);
    return;
  }
  const collapse = event.target.closest("[data-collapse]");
  if (collapse) {
    const id = collapse.dataset.collapse;
    if (state.collapsed.has(id)) state.collapsed.delete(id);
    else state.collapsed.add(id);
    render();
    return;
  }
  const statusButton = event.target.closest("[data-status]");
  if (statusButton) {
    applyStatus([statusButton.dataset.id], statusButton.dataset.status);
    return;
  }
  const row = event.target.closest("[data-test]");
  if (row) selectTest(row.dataset.test);
}

function handleField(event) {
  const field = event.target.dataset.field;
  const id = event.target.dataset.id;
  if (!field || !id) return;
  state.results = upsertResult(state.results, id, { [field]: event.target.value });
  scheduleSave();
}

async function handleBulk(event) {
  const select = event.target.closest("[data-bulk]");
  if (!select) return;
  const action = select.value;
  select.value = "";
  if (!action) return;
  const filter = {
    sectionId: select.dataset.section,
    subsectionId: select.dataset.subsection || undefined,
  };
  const ids = collectTestIds(state.definitions, filter);
  if (action === "reset") {
    const ok = await confirmAction(
      "Restart this section?",
      "This will clear pass/fail results, notes, and failure details for these tests. Definitions are kept.",
      "Restart section"
    );
    if (ok !== true) return;
    state.results = resetResults(state.results, ids);
    render();
    persist();
    return;
  }
  const label = action === "passed" ? "Marking these tests as passed" : "Marking these tests as skipped";
  if (!(await maybeOverwrite(filter, label))) return;
  applyStatus(ids, action);
}

els.main.addEventListener("click", handleWorkspaceClick);
els.detail.addEventListener("click", handleWorkspaceClick);
els.mobileBar.addEventListener("click", handleWorkspaceClick);
els.detail.addEventListener("input", handleField);
els.detail.addEventListener("change", handleField);
els.main.addEventListener("change", handleBulk);

els.banner.addEventListener("click", (event) => {
  if (event.target.id === "retry-save") persist();
});

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
    event.preventDefault();
    els.keysModal.hidden = !els.keysModal.hidden;
    return;
  }
  if (event.key === "Escape") {
    els.keysModal.hidden = true;
    els.moreMenu.hidden = true;
    return;
  }
  if (event.key === "ArrowRight") {
    const next = adjacentTest(visibleTests(), state.activeTestId, 1);
    if (next) {
      event.preventDefault();
      selectTest(next.id);
    }
    return;
  }
  if (event.key === "ArrowLeft") {
    const prev = adjacentTest(visibleTests(), state.activeTestId, -1);
    if (prev) {
      event.preventDefault();
      selectTest(prev.id);
    }
    return;
  }
  const keys = {
    p: "passed",
    f: "failed",
    b: "blocked",
    s: "skipped",
    i: "in_progress",
    n: "not_tested",
  };
  const status = keys[event.key.toLowerCase()];
  if (!status || !state.activeTestId) return;
  event.preventDefault();
  applyStatus([state.activeTestId], status);
});

els.modalCancel.addEventListener("click", () => closeModal(false));
els.modalConfirm.addEventListener("click", () => closeModal(true));
els.modalExtra.addEventListener("click", () => closeModal("export"));
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) closeModal(false);
});

window.addEventListener("hashchange", openFromHash);
window.addEventListener("resize", renderMobileBar);
window.addEventListener("offline", () => setSync("offline"));
window.addEventListener("online", () => {
  if (state.sync === "offline" || state.sync === "failed") persist();
});
window.setInterval(() => {
  if (state.results.updatedAt) els.savedAt.textContent = formatRelative(state.results.updatedAt);
}, 15000);

start();
