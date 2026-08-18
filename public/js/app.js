import { loadResults, saveResults } from "./api.js";
import {
  STATUS_LABELS,
  STATUSES,
  collectTestIds,
  countStatuses,
  displayStatus,
  emptyResultsDoc,
  extractImportedResults,
  flattenTestCases,
  getResult,
  matchesQuery,
  overwriteRisk,
  resetResults,
  upsertResult,
  validateDefinitions,
} from "./schema.js";

const state = {
  definitions: null,
  results: emptyResultsDoc(),
  query: "",
  status: "all",
  sync: "loading",
  message: "",
  collapsed: new Set(),
  openTests: new Set(),
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
  summary: document.getElementById("progress-summary"),
  bar: document.getElementById("progress-bar"),
  counts: document.getElementById("progress-counts"),
  chips: document.getElementById("status-filters"),
  search: document.getElementById("search"),
  main: document.getElementById("main"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalCancel: document.getElementById("modal-cancel"),
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
  els.savedAt.textContent = state.results.updatedAt
    ? `Last saved ${formatTime(state.results.updatedAt)}`
    : "";
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

function confirmAction(title, body, confirmLabel = "Confirm") {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = body;
  els.modalConfirm.textContent = confirmLabel;
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
      if (overwrite) {
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

function visibleTests() {
  return flattenTestCases(state.definitions).filter((test) =>
    matchesQuery(test, getResult(state.results, test.id), {
      query: state.query,
      status: state.status,
    })
  );
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
  render();
  persist();
}

async function maybeOverwrite(filter, actionLabel) {
  const risk = overwriteRisk(state.definitions, state.results, filter);
  if (!risk.existing) return true;
  return confirmAction(
    "Overwrite existing results?",
    `${actionLabel} will replace ${risk.existing} existing result(s), including ${risk.failed} failed test(s) and ${risk.withDetails} with notes or error details.`,
    "Overwrite"
  );
}

function renderProgress() {
  const counts = countStatuses(state.definitions, state.results);
  els.summary.textContent = `Overall: ${counts.completed} / ${counts.total} completed · ${counts.percent}%`;
  els.bar.style.width = `${counts.percent}%`;
  els.counts.innerHTML = STATUSES.map(
    (status) =>
      `<li><strong>${counts[status]}</strong> ${escapeHtml(STATUS_LABELS[status])}</li>`
  ).join("");
  els.chips.innerHTML = ["all", ...STATUSES]
    .map((status) => {
      const label = status === "all" ? "All" : STATUS_LABELS[status];
      const pressed = state.status === status;
      return `<button type="button" class="chip" data-filter="${status}" aria-pressed="${pressed}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function renderTest(test) {
  const result = getResult(state.results, test.id);
  const status = displayStatus(result.status);
  const open = state.openTests.has(test.id) || status === "failed";
  const failure = status === "failed"
    ? `<div class="failure-box">
        <label class="field"><span>Severity</span>
          <select data-field="severity" data-id="${escapeHtml(test.id)}">
            ${["", "Blocker", "Critical", "Major", "Minor"].map((item) => `<option value="${item}" ${result.severity === item ? "selected" : ""}>${item || "Select…"}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>What went wrong?</span><input data-field="error" data-id="${escapeHtml(test.id)}" value="${escapeHtml(result.error)}" /></label>
        <label class="field"><span>Error details</span><textarea data-field="errorDetails" data-id="${escapeHtml(test.id)}">${escapeHtml(result.errorDetails)}</textarea></label>
        <label class="field"><span>Expected result (optional)</span><textarea data-field="expectedResult" data-id="${escapeHtml(test.id)}">${escapeHtml(result.expectedResult || test.expectedResult)}</textarea></label>
        <label class="field"><span>Actual result (optional)</span><textarea data-field="actualResult" data-id="${escapeHtml(test.id)}">${escapeHtml(result.actualResult)}</textarea></label>
      </div>`
    : "";

  const spec = [
    test.priority && `<p class="muted"><strong>Priority:</strong> ${escapeHtml(test.priority)}</p>`,
    test.where && `<p><strong>Where:</strong> ${escapeHtml(test.where)}</p>`,
    test.url && `<p class="muted"><strong>URL:</strong> <code>${escapeHtml(test.url)}</code></p>`,
    test.given && `<p><strong>Given:</strong> ${escapeHtml(test.given)}</p>`,
    test.when && `<p><strong>When:</strong> ${escapeHtml(test.when)}</p>`,
    (test.then || test.expectedResult) && `<p><strong>Then:</strong> ${escapeHtml(test.then || test.expectedResult)}</p>`,
    !test.when && test.description && `<p>${escapeHtml(test.description)}</p>`,
  ].filter(Boolean).join("");

  return `<article class="test" data-test="${escapeHtml(test.id)}">
    <div class="test__head">
      <span class="pill ${status}">${escapeHtml(STATUS_LABELS[status])}</span>
      <div class="test__grow">
        <h4>${escapeHtml(test.title)}${test.priority ? ` <span class="prio">${escapeHtml(test.priority)}</span>` : ""}</h4>
        <div class="test__id">${escapeHtml(test.id)}</div>
      </div>
      <div class="status-actions">
        <button type="button" data-status="passed" data-id="${escapeHtml(test.id)}" aria-pressed="${status === "passed"}">Pass</button>
        <button type="button" data-status="failed" data-id="${escapeHtml(test.id)}" aria-pressed="${status === "failed"}">Fail</button>
        <button type="button" class="test-toggle" data-toggle-test="${escapeHtml(test.id)}">${open ? "Hide" : "Details"}</button>
      </div>
    </div>
    ${open ? `<div class="test__body">
      ${spec || "<p>No description.</p>"}
      <p class="muted">Last updated: ${escapeHtml(formatTime(result.updatedAt) || "—")}</p>
      <div class="status-actions">
        ${STATUSES.map((item) => `<button type="button" data-status="${item}" data-id="${escapeHtml(test.id)}" aria-pressed="${status === item}">${escapeHtml(STATUS_LABELS[item])}</button>`).join("")}
      </div>
      ${failure}
      <label class="field"><span>Tester notes</span><textarea data-field="notes" data-id="${escapeHtml(test.id)}">${escapeHtml(result.notes)}</textarea></label>
      <label class="field"><span>Additional comments</span><textarea data-field="comments" data-id="${escapeHtml(test.id)}">${escapeHtml(result.comments)}</textarea></label>
    </div>` : ""}
  </article>`;
}

function groupVisible() {
  const visible = visibleTests();
  const bySection = new Map();
  for (const test of visible) {
    if (!bySection.has(test.sectionId)) bySection.set(test.sectionId, []);
    bySection.get(test.sectionId).push(test);
  }
  return bySection;
}

function render() {
  if (!state.definitions) return;
  els.title.textContent = state.definitions.title || "Offload Test Cases";
  renderProgress();
  if (state.definitions.description && !document.getElementById("catalog-note")) {
    const note = document.createElement("p");
    note.id = "catalog-note";
    note.className = "muted catalog-note";
    note.textContent = state.definitions.description;
    els.summary.after(note);
  }

  const grouped = groupVisible();
  if (!grouped.size) {
    els.main.innerHTML = `<p class="empty">No test cases match this filter.</p>`;
    return;
  }

  els.main.innerHTML = state.definitions.sections
    .map((section) => {
      const sectionTests = grouped.get(section.id);
      if (!sectionTests) return "";
      const counts = countStatuses(
        { sections: [section] },
        state.results
      );
      const collapsed = state.collapsed.has(section.id);
      const subsections = Array.isArray(section.subsections) ? section.subsections : [];
      const body = collapsed
        ? ""
        : `<div class="section__body">
            ${subsections
              .map((subsection) => {
                const tests = sectionTests.filter((test) => test.subsectionId === subsection.id);
                if (!tests.length) return "";
                const subCounts = countStatuses(
                  { sections: [{ ...section, subsections: [subsection], testCases: [] }] },
                  state.results
                );
                return `<section class="subsection">
                  <div class="subsection__head">
                    <div class="section__grow">
                      <h3>${escapeHtml(subsection.title)}</h3>
                      <p class="meta">${subCounts.completed} / ${subCounts.total} · ${subCounts.percent}%</p>
                    </div>
                    <select data-bulk data-section="${escapeHtml(section.id)}" data-subsection="${escapeHtml(subsection.id)}">
                      <option value="">Subsection actions</option>
                      <option value="passed">Mark passed</option>
                      <option value="skipped">Mark skipped</option>
                      <option value="reset">Restart subsection</option>
                    </select>
                  </div>
                  <div class="subsection__body">${tests.map(renderTest).join("")}</div>
                </section>`;
              })
              .join("")}
            ${sectionTests.filter((test) => !test.subsectionId).map(renderTest).join("")}
          </div>`;

      return `<section class="section">
        <div class="section__head">
          <button type="button" data-collapse="${escapeHtml(section.id)}" class="section__grow">
            <h2>${escapeHtml(section.title)}</h2>
            <p class="meta">${counts.completed} / ${counts.total} completed · ${counts.percent}% · Passed ${counts.passed} · Failed ${counts.failed} · In Progress ${counts.in_progress} · Not Tested ${counts.not_tested}</p>
          </button>
          <div class="section__tools">
            <select data-bulk data-section="${escapeHtml(section.id)}">
              <option value="">Section actions</option>
              <option value="passed">Mark entire section passed</option>
              <option value="skipped">Mark entire section skipped</option>
              <option value="reset">Restart section</option>
            </select>
          </div>
        </div>
        ${body}
      </section>`;
    })
    .join("");
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

async function start() {
  try {
    await loadDefinitions();
    await refreshResults({ quiet: true });
    setSync("saved");
    if (!state.results.updatedAt) els.savedAt.textContent = "No results saved yet";
  } catch (error) {
    setSync("failed", error.message);
    showBanner(`<strong>Unable to load test data.</strong><p>${escapeHtml(error.message)}</p>`);
  }
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

document.getElementById("btn-export").addEventListener("click", () => {
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
});

document.getElementById("btn-import").addEventListener("click", () => els.importFile.click());

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
  if (!ok) return;
  state.results = {
    ...state.results,
    results: imported.value.results,
  };
  render();
  persist();
});

document.getElementById("btn-reset-all").addEventListener("click", async () => {
  const ids = collectTestIds(state.definitions);
  const risk = overwriteRisk(state.definitions, state.results);
  const ok = await confirmAction(
    "Restart full test?",
    risk.existing
      ? `This clears all KV results (${risk.existing} existing). Test case definitions stay in the repo.`
      : "This clears KV results. Test case definitions stay in the repo.",
    "Restart"
  );
  if (!ok) return;
  state.results = resetResults(state.results, null);
  render();
  persist();
  void ids;
});

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

els.chips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.status = button.dataset.filter;
  render();
});

els.banner.addEventListener("click", (event) => {
  if (event.target.id === "retry-save") persist();
});

els.main.addEventListener("click", async (event) => {
  const collapse = event.target.closest("[data-collapse]");
  if (collapse) {
    const id = collapse.dataset.collapse;
    if (state.collapsed.has(id)) state.collapsed.delete(id);
    else state.collapsed.add(id);
    render();
    return;
  }

  const toggle = event.target.closest("[data-toggle-test]");
  if (toggle) {
    const id = toggle.dataset.toggleTest;
    if (state.openTests.has(id)) state.openTests.delete(id);
    else state.openTests.add(id);
    render();
    return;
  }

  const statusButton = event.target.closest("[data-status]");
  if (statusButton) {
    const id = statusButton.dataset.id;
    const status = statusButton.dataset.status;
    if (status === "failed") state.openTests.add(id);
    applyStatus([id], status);
  }
});

els.main.addEventListener("change", async (event) => {
  if (event.target.dataset.field && event.target.dataset.id) {
    state.results = upsertResult(state.results, event.target.dataset.id, {
      [event.target.dataset.field]: event.target.value,
    });
    scheduleSave();
    return;
  }
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
      "Restart this group?",
      "Statuses, notes, and error details for these tests will be cleared. Definitions are kept.",
      "Restart"
    );
    if (!ok) return;
    state.results = resetResults(state.results, ids);
    render();
    persist();
    return;
  }
  const label = action === "passed" ? "Marking these tests as passed" : "Marking these tests as skipped";
  if (!(await maybeOverwrite(filter, label))) return;
  applyStatus(ids, action);
});

els.main.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  const id = event.target.dataset.id;
  if (!field || !id) return;
  state.results = upsertResult(state.results, id, { [field]: event.target.value });
  scheduleSave();
});

els.modalCancel.addEventListener("click", () => closeModal(false));
els.modalConfirm.addEventListener("click", () => closeModal(true));
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) closeModal(false);
});

window.addEventListener("offline", () => setSync("offline"));
window.addEventListener("online", () => {
  if (state.sync === "offline" || state.sync === "failed") persist();
});

start();
