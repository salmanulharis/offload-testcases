import { loadResults, saveResults } from "./api.js";
import {
  STATUS_LABELS,
  STATUS_MARKS,
  adjacentTest,
  buildRunnerQueue,
  collectTestIds,
  countByPriority,
  countStatuses,
  displayStatus,
  emptyResultsDoc,
  extractImportedResults,
  firstIncompleteSection,
  firstUnresolved,
  flattenTestCases,
  formatFailureReport,
  getResult,
  matchesQuery,
  nextIncompleteSection,
  nextUnresolved,
  overwriteRisk,
  remainingCount,
  resetResults,
  runOutcome,
  testsInSection,
  upsertResult,
  validateDefinitions,
} from "./schema.js";

const RUNNER_KEY = "offload-qa-runner";

const state = {
  definitions: null,
  results: emptyResultsDoc(),
  query: "",
  status: "all",
  priority: "all",
  view: "all",
  sectionId: "",
  goal: "all",
  activeTestId: "",
  screen: "overview",
  runner: { mode: "section", sectionId: "", testId: "", autoNext: true, done: false },
  sync: "loading",
  message: "",
  collapsed: new Set(),
  collapseReady: false,
  openPopover: null,
  selectedSectionId: "",
  sidebarCollapsed: false,
  sidebarDrawerOpen: false,
  lastError: "",
};

let saveTimer = 0;
let saving = false;
let queued = false;
let modalResolver = null;
let toastTimer = 0;
let pendingId = "";

const els = {
  title: document.getElementById("app-title"),
  sync: document.getElementById("sync-status"),
  savedAt: document.getElementById("saved-at"),
  banner: document.getElementById("banner"),
  toast: document.getElementById("toast"),
  overview: document.getElementById("app-overview"),
  runner: document.getElementById("app-runner"),
  complete: document.getElementById("complete-banner"),
  runPill: document.getElementById("run-complete-label"),
  views: document.getElementById("run-views"),
  summary: document.getElementById("progress-summary"),
  prioritySummary: document.getElementById("priority-summary"),
  bar: document.getElementById("progress-bar"),
  counts: document.getElementById("progress-counts"),
  continueCard: document.getElementById("continue-card"),
  quick: document.getElementById("quick-filters"),
  extra: document.getElementById("extra-filters"),
  activeFilters: document.getElementById("active-filters"),
  sectionFilter: document.getElementById("section-filter"),
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  sectionsBtn: document.getElementById("btn-sections"),
  search: document.getElementById("search"),
  main: document.getElementById("main"),
  detail: document.getElementById("detail"),
  more: document.getElementById("btn-more"),
  moreMenu: document.getElementById("more-menu"),
  overviewBtn: document.getElementById("btn-overview"),
  continueBtn: document.getElementById("btn-continue"),
  keysModal: document.getElementById("keys-modal"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalCancel: document.getElementById("modal-cancel"),
  modalExtra: document.getElementById("modal-extra"),
  modalConfirm: document.getElementById("modal-confirm"),
  failModal: document.getElementById("fail-modal"),
  failForm: document.getElementById("fail-form"),
  blockModal: document.getElementById("block-modal"),
  blockForm: document.getElementById("block-form"),
  importFile: document.getElementById("import-file"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setPopover(id) {
  state.openPopover = state.openPopover === id ? null : id;
  applyPopovers();
}

function closePopover() {
  state.openPopover = null;
  applyPopovers();
}

function applyPopovers() {
  const moreOpen = state.openPopover === "more";
  if (els.moreMenu) els.moreMenu.hidden = !moreOpen;
  if (els.more) {
    els.more.setAttribute("aria-expanded", String(moreOpen));
    els.more.textContent = moreOpen ? "More ▾" : "More";
  }
  document.querySelectorAll("[data-popover]").forEach((el) => {
    el.hidden = state.openPopover !== el.dataset.popover;
    const toggle = el.parentElement?.querySelector("[data-menu-toggle]");
    toggle?.setAttribute("aria-expanded", String(!el.hidden));
  });
  const open = document.querySelector(".more__menu:not([hidden])");
  if (!open) return;
  open.style.top = "";
  open.style.bottom = "";
  const rect = open.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - 8) {
    open.style.top = "auto";
    open.style.bottom = "calc(100% + 6px)";
  }
}

function applyDrawer() {
  els.sidebar?.classList.toggle("is-drawer-open", state.sidebarDrawerOpen);
  if (els.sidebarBackdrop) {
    els.sidebarBackdrop.hidden = !state.sidebarDrawerOpen;
    els.sidebarBackdrop.classList.toggle("is-open", state.sidebarDrawerOpen);
  }
  document.body.classList.toggle("is-drawer-open", state.sidebarDrawerOpen);
}

function defaultSectionId() {
  return firstIncompleteSection(state.definitions, state.results)?.id || state.definitions.sections[0]?.id || "";
}

function caseUrl(id) {
  const url = new URL(location.href);
  if (id) {
    url.searchParams.set("case", id);
    url.hash = encodeURIComponent(id);
  } else {
    url.searchParams.delete("case");
    url.hash = "";
  }
  return url;
}

function copyTestLink(id) {
  const url = caseUrl(id).toString();
  navigator.clipboard?.writeText(url);
  showToast("Link copied");
}

function deepLinkId() {
  const fromQuery = new URLSearchParams(location.search).get("case");
  if (fromQuery) return fromQuery;
  return decodeURIComponent(location.hash.replace(/^#/, ""));
}

function revealSection(sectionId, { scroll = true } = {}) {
  if (!sectionId || !findSection(sectionId)) return;
  state.selectedSectionId = sectionId;
  state.collapsed.delete(sectionId);
  persistCollapsed();
  state.sidebarDrawerOpen = false;
  if (state.sectionId && state.sectionId !== sectionId) state.sectionId = "";
  render();
  if (scroll) {
    requestAnimationFrame(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function persistCollapsed() {
  try {
    localStorage.setItem("offload-collapsed", JSON.stringify([...state.collapsed]));
  } catch {
    /* ignore */
  }
}

function persistSidebar() {
  try {
    localStorage.setItem("offload-sidebar", state.sidebarCollapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function ensureCollapseDefaults() {
  if (state.collapseReady || !state.definitions) return;
  state.collapseReady = true;
  try {
    const saved = JSON.parse(localStorage.getItem("offload-collapsed") || "null");
    if (Array.isArray(saved)) {
      state.collapsed = new Set(saved);
      return;
    }
  } catch {
    /* use default */
  }
  const keep = firstIncompleteSection(state.definitions, state.results)?.id || state.definitions.sections[0]?.id;
  for (const section of state.definitions.sections) {
    if (section.id !== keep) state.collapsed.add(section.id);
  }
}

function sectionLabel(section) {
  const item = typeof section === "string" ? findSection(section) : section;
  if (!item) return "";
  const index = state.definitions.sections.findIndex((entry) => entry.id === item.id);
  const raw = String(item.title || "").replace(/^\d+\.\s*/, "");
  return `${index + 1}. ${raw}`;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function hasPersistedResults() {
  return Boolean(state.results.updatedAt || Object.keys(state.results.results || {}).length);
}

function formatRelative(value) {
  if (!hasPersistedResults()) return "No test results yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  return date.toLocaleTimeString();
}

function badge(status) {
  const shown = displayStatus(status);
  return `<span class="badge ${shown}">${STATUS_MARKS[shown]} ${escapeHtml(STATUS_LABELS[shown])}</span>`;
}

function goalChips(goals = []) {
  return goals.map((goal) => `<span class="goal">${escapeHtml(goal)}</span>`).join("");
}

function specPurpose(test) {
  return `${test.purpose ? `<div class="spec__row purpose"><dt>Checking purpose</dt><dd>${escapeHtml(test.purpose)}</dd></div>` : ""}
        ${test.goals?.length ? `<div class="spec__row"><dt>Goal</dt><dd>${goalChips(test.goals)}</dd></div>` : ""}
        ${test.failImpact ? `<div class="spec__row impact"><dt>Fail impact</dt><dd>${escapeHtml(test.failImpact)}</dd></div>` : ""}`;
}

function setSync(sync, message = "") {
  state.sync = sync;
  state.message = message;
  const started = hasPersistedResults();
  const labels = {
    loading: "Loading…",
    saving: "Saving…",
    saved: started ? "✓ Saved" : "Not started",
    failed: "⚠ Save failed",
    offline: "Offline / unable to sync",
  };
  els.sync.dataset.state = started || sync !== "saved" ? sync : "loading";
  els.sync.textContent = message || labels[sync] || sync;
  if (sync === "failed") {
    els.savedAt.innerHTML = `<button type="button" id="retry-save">Retry</button>`;
  } else {
    els.savedAt.textContent = formatRelative(state.results.updatedAt);
  }
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

function showToast(text) {
  els.toast.hidden = false;
  els.toast.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 900);
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
      goal: state.goal,
    })
  );
}

function findTest(id) {
  return allTests().find((test) => test.id === id) || null;
}

function findSection(id) {
  return state.definitions.sections.find((section) => section.id === id) || null;
}

function runnerQueue() {
  return buildRunnerQueue(state.definitions, state.results, state.runner);
}

function persistRunner() {
  try {
    localStorage.setItem(
      RUNNER_KEY,
      JSON.stringify({
        screen: state.screen,
        runner: state.runner,
        activeTestId: state.activeTestId,
      })
    );
  } catch {
    /* ignore quota */
  }
}

function restoreRunner() {
  try {
    state.sidebarCollapsed = localStorage.getItem("offload-sidebar") === "1";
  } catch {
    state.sidebarCollapsed = false;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(RUNNER_KEY) || "null");
    if (!saved?.runner) return;
    state.runner = { ...state.runner, ...saved.runner };
    state.activeTestId = saved.activeTestId || state.runner.testId || "";
    if (saved.screen === "runner" && state.runner.testId) state.screen = "runner";
  } catch {
    /* ignore */
  }
}

function exportResults(filter) {
  const ids = filter ? new Set(collectTestIds(state.definitions, filter)) : null;
  const results = ids
    ? Object.fromEntries(Object.entries(state.results.results).filter(([id]) => ids.has(id)))
    : state.results.results;
  const payload = {
    exportedAt: new Date().toISOString(),
    title: state.definitions?.title || "",
    revision: state.results.revision,
    updatedAt: state.results.updatedAt,
    results,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `offload-test-results-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
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

function applyStatus(ids, status, extra = {}) {
  let next = state.results;
  for (const id of ids) {
    const patch = { status, ...extra };
    if (status !== "failed") {
      patch.error = "";
      patch.errorDetails = "";
      patch.actualResult = "";
    }
    if (status !== "blocked") patch.blockedReason = extra.blockedReason || "";
    next = upsertResult(next, id, patch);
  }
  state.results = next;
  persist();
}

function openRunner({ mode = "section", sectionId = "", testId = "", done = false } = {}) {
  state.screen = "runner";
  state.runner = { ...state.runner, mode, sectionId, testId, done };
  if (testId) state.activeTestId = testId;
  persistRunner();
  render();
}

function closeRunner() {
  state.screen = "overview";
  if (state.runner.sectionId) {
    state.selectedSectionId = state.runner.sectionId;
    state.collapsed.delete(state.runner.sectionId);
    persistCollapsed();
  }
  persistRunner();
  render();
  requestAnimationFrame(() => {
    if (state.selectedSectionId) {
      document.getElementById(`section-${state.selectedSectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function startSection(sectionId, mode = "section") {
  const tests = buildRunnerQueue(state.definitions, state.results, { mode, sectionId });
  const start = firstUnresolved(tests, state.results) || tests[0] || null;
  if (!start && mode === "failed") {
    showToast("No failed tests in this section");
    return;
  }
  openRunner({ mode, sectionId, testId: start?.id || "", done: !start && mode === "section" });
}

function continueTesting() {
  const saved = findTest(state.runner.testId);
  if (saved && state.runner.sectionId) {
    const section = findSection(state.runner.sectionId);
    const counts = section ? countStatuses({ sections: [section] }, state.results) : null;
    if (counts && remainingCount(counts) > 0) {
      openRunner({ ...state.runner, testId: saved.id, done: false });
      return;
    }
  }
  const section = firstIncompleteSection(state.definitions, state.results);
  if (section) {
    startSection(section.id);
    return;
  }
  state.screen = "overview";
  render();
}

function runnerAdvance(fromId) {
  const queue = runnerQueue();
  const next = nextUnresolved(queue, state.results, fromId);
  if (next && next.id !== fromId) {
    state.runner.testId = next.id;
    state.runner.done = false;
    state.activeTestId = next.id;
    persistRunner();
    render();
    return;
  }
  if (state.runner.mode === "section" && state.runner.sectionId) {
    const section = findSection(state.runner.sectionId);
    const remaining = section ? remainingCount(countStatuses({ sections: [section] }, state.results)) : 0;
    if (remaining === 0) {
      state.runner.done = true;
      persistRunner();
      render();
      return;
    }
  }
  if (!next) {
    state.runner.done = true;
    persistRunner();
    render();
  }
}

function afterResult(id, status) {
  const labels = {
    passed: "✓ Test passed",
    failed: "✕ Failure saved",
    blocked: "! Blocked saved",
    skipped: "— Skipped",
    in_progress: "◐ In progress",
    not_tested: "○ Reset to not tested",
  };
  showToast(labels[status] || "Saved");
  if (state.screen === "runner" && state.runner.autoNext && ["passed", "failed", "blocked", "skipped"].includes(status)) {
    window.setTimeout(() => runnerAdvance(id), 350);
    return;
  }
  render();
}

function requestStatus(id, status) {
  pendingId = id;
  if (status === "failed") {
    const test = findTest(id);
    const result = getResult(state.results, id);
    els.failForm.severity.value = result.severity || "";
    els.failForm.error.value = result.error || "";
    els.failForm.expectedResult.value = result.expectedResult || test?.then || test?.expectedResult || "";
    els.failForm.actualResult.value = result.actualResult || "";
    els.failForm.comments.value = result.comments || "";
    els.failModal.hidden = false;
    els.failForm.error.focus();
    return;
  }
  if (status === "blocked") {
    const result = getResult(state.results, id);
    const reason = result.blockedReason;
    for (const input of els.blockForm.elements.blockedReason) {
      input.checked = input.value === reason;
    }
    els.blockForm.comments.value = result.comments || "";
    els.blockModal.hidden = false;
    return;
  }
  applyStatus([id], status);
  afterResult(id, status);
}

function selectTest(id) {
  state.activeTestId = id || "";
  const test = findTest(id);
  if (test) {
    state.selectedSectionId = test.sectionId;
    if (state.collapsed.has(test.sectionId)) {
      state.collapsed.delete(test.sectionId);
      persistCollapsed();
    }
  }
  history.replaceState(null, "", caseUrl(id));
  persistRunner();
  if (state.screen === "overview") render();
}

function renderHeaderProgress() {
  const counts = countStatuses(state.definitions, state.results);
  const remaining = remainingCount(counts);
  const outcome = runOutcome(counts);
  els.runPill.textContent = remaining
    ? `${counts.resolved} / ${counts.total} · ${counts.resolvedPercent}%`
    : outcome === "passed"
      ? "Run passed"
      : "Run failed";
  return counts;
}

function renderShell() {
  const inRunner = state.screen === "runner";
  document.body.classList.toggle("is-runner", inRunner);
  els.overview.hidden = inRunner;
  els.runner.hidden = !inRunner;
  if (els.overviewBtn) {
    els.overviewBtn.hidden = !inRunner;
    const counts = countStatuses(state.definitions, state.results);
    els.overviewBtn.textContent = `← Full list · ${counts.resolved}/${counts.total}`;
  }
  if (els.continueBtn) {
    els.continueBtn.hidden = inRunner || !firstIncompleteSection(state.definitions, state.results);
  }
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
  els.prioritySummary.textContent = ["P0", "P1"]
    .filter((key) => priorities[key])
    .map((key) => `${key}: ${priorities[key].completed} / ${priorities[key].total}`)
    .join("   ");

  els.counts.innerHTML = [
    ["passed", counts.passed],
    ["failed", counts.failed],
    ["blocked", counts.blocked],
    ["skipped", counts.skipped],
    ["not_tested", counts.not_tested],
    ["in_progress", counts.in_progress],
  ]
    .map(
      ([status, value]) =>
        `<li><button type="button" class="${status}" data-view="${status}" aria-pressed="${state.view === status}"><strong>${value}</strong>${escapeHtml(STATUS_LABELS[status])}</button></li>`
    )
    .join("");

  els.views.innerHTML = [
    ["all", "All tests"],
    ["failed", `Failed (${counts.failed})`],
    ["blocked", `Blocked (${counts.blocked})`],
    ["not_tested", `Not tested (${counts.not_tested})`],
  ]
    .map(([view, label]) => `<button type="button" data-view="${view}" aria-pressed="${state.view === view}">${escapeHtml(label)}</button>`)
    .join("") + (counts.failed ? `<button type="button" data-retest="failed">Retest failed</button>` : "") + (counts.blocked ? `<button type="button" data-retest="blocked">Review blocked</button>` : "");

  els.quick.innerHTML = [
    ["view", "all", "All"],
    ["priority", "P0", "P0"],
    ["priority", "P1", "P1"],
    ["view", "failed", "Failed"],
    ["view", "blocked", "Blocked"],
    ["view", "not_tested", "Not tested"],
  ]
    .map(([kind, value, label]) => {
      const pressed = kind === "priority" ? state.priority === value : state.view === value;
      return `<button type="button" class="chip" data-${kind}="${value}" aria-pressed="${pressed}">${label}</button>`;
    })
    .join("");
  if (els.extra) {
    const goals = Array.isArray(state.definitions.goals) ? state.definitions.goals : [];
    els.extra.innerHTML = [
      ["in_progress", "In Progress"],
      ["skipped", "Skipped"],
      ["passed", "Passed"],
    ]
      .map(([value, label]) => `<button type="button" class="chip" data-view="${value}" aria-pressed="${state.view === value}">${label}</button>`)
      .join("") + goals
      .map((goal) => `<button type="button" class="chip" data-goal="${escapeHtml(goal.id)}" aria-pressed="${state.goal === goal.id}" title="${escapeHtml(goal.proves)}">${escapeHtml(goal.id)}</button>`)
      .join("");
  }

  els.sectionFilter.innerHTML = `<option value="">All sections</option>${state.definitions.sections
    .map((section) => `<option value="${escapeHtml(section.id)}" ${state.sectionId === section.id ? "selected" : ""}>${escapeHtml(sectionLabel(section))}</option>`)
    .join("")}`;

  const chips = [];
  if (state.view !== "all") chips.push(["view", `Status: ${STATUS_LABELS[state.view] || state.view}`]);
  if (state.priority !== "all") chips.push(["priority", `Priority: ${state.priority}`]);
  if (state.sectionId) chips.push(["section", `Section: ${sectionLabel(state.sectionId)}`]);
  if (state.goal !== "all") chips.push(["goal", `Goal: ${state.goal}`]);
  els.activeFilters.innerHTML = chips
    .map(([kind, label]) => `<button type="button" data-clear="${kind}">${escapeHtml(label)} ×</button>`)
    .join("");

  renderContinueCard(counts, remaining, outcome);
}

function renderContinueCard(counts, remaining, outcome) {
  const saved = findTest(state.runner.testId);
  const section = findSection(state.runner.sectionId);
  const sectionCounts = section ? countStatuses({ sections: [section] }, state.results) : null;
  const nextSection = firstIncompleteSection(state.definitions, state.results);

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
        <button type="button" data-retest="failed">Retest all failed</button>
        <button type="button" id="btn-export-complete">Export JSON</button>
        <button type="button" id="btn-reset-complete" class="danger">Restart run</button>
      </div>`;
    els.continueCard.hidden = true;
    return;
  }
  els.complete.hidden = true;

  if (section && sectionCounts && remainingCount(sectionCounts) === 0 && nextSection) {
    els.continueCard.hidden = false;
    els.continueCard.innerHTML = `
      <h2 id="continue-heading">Section complete</h2>
      <div class="continue-card__row">
        <div>
          <strong>${escapeHtml(sectionLabel(section))}</strong>
          <p class="muted">${sectionCounts.resolved} / ${sectionCounts.total} completed</p>
          <p>Next: ${escapeHtml(sectionLabel(nextSection))}</p>
        </div>
        <button type="button" class="primary" data-start-section="${escapeHtml(nextSection.id)}">Continue to next section →</button>
      </div>`;
    return;
  }

  if (saved && section && sectionCounts && remainingCount(sectionCounts) > 0) {
    const queue = testsInSection(state.definitions, section.id);
    const index = Math.max(0, queue.findIndex((test) => test.id === saved.id));
    els.continueCard.hidden = false;
    els.continueCard.innerHTML = `
      <h2 id="continue-heading">Continue testing</h2>
      <div class="continue-card__row">
        <div>
          <p>${escapeHtml(sectionLabel(section))} · Test ${index + 1} of ${queue.length}</p>
          <strong>${escapeHtml(saved.id)}${saved.priority ? ` · ${escapeHtml(saved.priority)}` : ""}</strong>
          <p class="muted">${escapeHtml(saved.title)}</p>
        </div>
        <button type="button" class="primary" data-resume>Resume testing →</button>
      </div>`;
    return;
  }

  const next = firstUnresolved(allTests(), state.results) || firstIncompleteSection(state.definitions, state.results);
  const nextTest = firstUnresolved(allTests(), state.results);
  els.continueCard.hidden = false;
  els.continueCard.innerHTML = `
    <h2 id="continue-heading">Continue testing</h2>
    <div class="continue-card__row">
      <div>
        <strong>${escapeHtml(nextTest?.id || "Next section")}${nextTest?.priority ? ` · ${escapeHtml(nextTest.priority)}` : ""}</strong>
        <p>${escapeHtml(nextTest ? sectionLabel(nextTest.sectionId) : sectionLabel(next))}</p>
        <p class="muted">${escapeHtml(nextTest?.title || "Start the first incomplete section")}</p>
      </div>
      <button type="button" class="primary" data-continue>Continue testing →</button>
    </div>`;
}

function renderSidebar() {
  if (!state.selectedSectionId) state.selectedSectionId = defaultSectionId();
  const compact = state.sidebarCollapsed && window.matchMedia("(min-width: 1100px)").matches && !state.sidebarDrawerOpen;
  els.sidebar.classList.toggle("is-collapsed", compact);
  els.sidebar.parentElement?.classList.toggle("is-sidebar-collapsed", compact);
  applyDrawer();
  const map = Array.isArray(state.definitions.pageMap) ? state.definitions.pageMap : [];
  const howto = !compact && state.definitions.description
    ? `<details class="howto"><summary>How to run this pass</summary><p class="muted">${escapeHtml(state.definitions.description)}</p>${map
        .map((item) => `<p><strong>${escapeHtml(item.screen)}</strong><br><span class="muted">${escapeHtml(item.path)}</span>${item.url ? `<br><code>${escapeHtml(item.url)}</code>` : ""}</p>`)
        .join("")}</details>`
    : "";
  els.sidebar.innerHTML = `<div class="sidebar__head">
      <h2>Test sections</h2>
      <button type="button" class="sidebar-close" data-close-drawer aria-label="Close sections">×</button>
      <button type="button" class="sidebar-collapse" data-toggle-sidebar aria-label="${compact ? "Expand sections" : "Collapse sections"}">${compact ? "→" : "←"}</button>
    </div>${state.definitions.sections
    .map((section, index) => {
      const counts = countStatuses({ sections: [section] }, state.results);
      const remaining = remainingCount(counts);
      const current = state.selectedSectionId === section.id;
      const mark = remaining === 0 ? "✓" : counts.resolved ? "●" : "○";
      const label = sectionLabel(section);
      const action = remaining === 0 ? "Review section" : counts.resolved ? "Continue section" : "Start section";
      return `<article class="nav-section ${current ? "is-active" : ""} ${remaining === 0 ? "is-done" : counts.resolved ? "is-current" : ""}">
        <button type="button" class="nav-section__top" data-section="${escapeHtml(section.id)}" title="${escapeHtml(label)}">
          <span class="mark" aria-hidden="true">${mark}</span>
          <span class="title">${compact ? `<span class="nav-num">${index + 1}</span>` : escapeHtml(label)}<small>${counts.resolved} / ${counts.total}${compact ? "" : " completed"}</small></span>
        </button>
        <span class="mini-bar" aria-hidden="true"><span style="width:${counts.resolvedPercent}%"></span></span>
        <button type="button" class="section-go" data-start-section="${escapeHtml(section.id)}">${action}</button>
      </article>`;
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
            ${section.purpose ? `<p class="section-purpose">${escapeHtml(section.purpose)}</p>` : ""}
            ${subsections
              .map((subsection) => {
                const rows = tests.filter((test) => test.subsectionId === subsection.id);
                if (!rows.length) return "";
                return `<p class="subsection-label">${escapeHtml(subsection.title)}</p>${rows.map(renderRow).join("")}`;
              })
              .join("")}
            ${tests.filter((test) => !test.subsectionId).map(renderRow).join("")}
          </div>`;
      const action = remainingCount(counts) === 0 ? "Review section" : counts.resolved ? "Continue section" : "Start section";
      return `<section class="section ${state.selectedSectionId === section.id ? "is-current" : ""}" id="section-${escapeHtml(section.id)}">
        <div class="section__head">
          <button type="button" data-collapse="${escapeHtml(section.id)}" class="section__grow" aria-expanded="${!collapsed}">
            <span class="chevron" aria-hidden="true">${collapsed ? "▶" : "▼"}</span>
            <span>
              <h3>${escapeHtml(sectionLabel(section))}</h3>
              <p class="meta">${counts.resolved} / ${counts.total} · ${counts.passed} passed · ${counts.failed} failed · ${remainingCount(counts)} remaining ${goalChips(section.goals || [])}</p>
            </span>
          </button>
          <div class="section__tools">
            <button type="button" class="primary" data-start-section="${escapeHtml(section.id)}">${action}</button>
            <div class="section-more">
              <button type="button" data-menu-toggle aria-expanded="false" aria-label="Section actions">⋮</button>
              <div class="more__menu" data-popover="section:${escapeHtml(section.id)}" hidden>
                <button type="button" data-bulk-action="failed" data-section="${escapeHtml(section.id)}">Review failed</button>
                <button type="button" data-bulk-action="export" data-section="${escapeHtml(section.id)}">Export section</button>
                <button type="button" data-bulk-action="reset" data-section="${escapeHtml(section.id)}" class="danger">Restart section</button>
              </div>
            </div>
          </div>
        </div>
        ${body}
      </section>`;
    })
    .join("");
}

function renderRow(test) {
  const result = getResult(state.results, test.id);
  const status = displayStatus(result.status);
  const selected = state.activeTestId === test.id;
  return `<article class="test-row is-${status}${selected ? " is-active" : ""}" data-test="${escapeHtml(test.id)}">
    ${badge(status)}
    <span>
      <span class="id">${escapeHtml(test.id)}${test.priority ? ` <span class="prio ${escapeHtml(test.priority.toLowerCase())}">${escapeHtml(test.priority)}</span>` : ""} ${goalChips(test.goals)}</span>
      <h4>${escapeHtml(test.title)}</h4>
      ${selected && test.purpose ? `<p class="purpose-line">${escapeHtml(test.purpose)}</p>` : ""}
    </span>
    ${selected ? `<button type="button" data-start-section="${escapeHtml(test.sectionId)}" data-test-id="${escapeHtml(test.id)}">Open test →</button>` : ""}
  </article>`;
}

function renderDetail() {
  const test = findTest(state.activeTestId);
  if (!test) {
    els.detail.innerHTML = `<h2>Execute</h2>
      <p><strong>Select a test to view details</strong></p>
      <p class="muted">or use Continue Testing to start sequential execution.</p>
      <p><button type="button" class="primary" data-continue>Continue testing →</button></p>`;
    return;
  }
  const result = getResult(state.results, test.id);
  const status = displayStatus(result.status);
  const inThis = state.runner.testId === test.id;
  els.detail.innerHTML = `
    <h2>${inThis ? "Current test" : "Execute"}</h2>
    <p class="id">${escapeHtml(test.id)}</p>
    ${test.priority ? `<p><span class="prio ${escapeHtml(test.priority.toLowerCase())}">${escapeHtml(test.priority)}</span> ${goalChips(test.goals)}</p>` : `<p>${goalChips(test.goals)}</p>`}
    <h3>${escapeHtml(test.title)}</h3>
    ${test.purpose ? `<p class="purpose-line">${escapeHtml(test.purpose)}</p>` : ""}
    <p class="muted">${escapeHtml(sectionLabel(test.sectionId))}${test.subsectionTitle ? ` → ${escapeHtml(test.subsectionTitle)}` : ""}</p>
    <p>${badge(status)}</p>
    <button type="button" class="primary" data-start-section="${escapeHtml(test.sectionId)}" data-test-id="${escapeHtml(test.id)}">${inThis ? "Open test →" : "Start this test →"}</button>
    <p><button type="button" data-copy-link="${escapeHtml(test.id)}">Copy link</button></p>
  `;
}

function renderRunner() {
  const section = findSection(state.runner.sectionId);
  const queue = runnerQueue();
  const test = findTest(state.runner.testId) || queue[0] || null;
  const counts = section
    ? countStatuses({ sections: [section] }, state.results)
    : countStatuses(state.definitions, state.results);
  const title = state.runner.mode === "failed"
    ? "Retest failed"
    : state.runner.mode === "blocked"
      ? "Review blocked"
      : state.runner.mode === "p0"
        ? "P0 queue"
        : state.runner.mode === "todo" || state.runner.mode === "not_tested"
          ? "Queue: Not tested"
          : section
            ? `Queue: ${sectionLabel(section)}`
            : "Sequential runner";

  const overall = countStatuses(state.definitions, state.results);
  const overallRemaining = remainingCount(overall);

  if (state.runner.done || !test) {
    const next = nextIncompleteSection(state.definitions, state.results, state.runner.sectionId);
    els.runner.innerHTML = `
      <article class="runner runner-complete">
        <div class="runner__top">
          <button type="button" data-back>← Full list</button>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <p class="runner__overall">Overall progress: ${overall.resolved} / ${overall.total} completed · ${overallRemaining} remaining</p>
        <h2>✓ Section complete</h2>
        <p>${counts.resolved} / ${counts.total} completed in this queue</p>
        <p>✓ ${counts.passed} Passed · ✕ ${counts.failed} Failed · ! ${counts.blocked} Blocked · — ${counts.skipped} Skipped</p>
        <div class="actions">
          <button type="button" data-back>View full list and progress</button>
          ${counts.failed ? `<button type="button" data-start-section="${escapeHtml(state.runner.sectionId)}" data-mode="failed">Retest failed tests</button>` : ""}
          ${next ? `<button type="button" class="primary" data-start-section="${escapeHtml(next.id)}">Continue to ${escapeHtml(sectionLabel(next))} →</button>` : `<button type="button" class="primary" data-back>Back to overview</button>`}
        </div>
      </article>`;
    return;
  }

  const result = getResult(state.results, test.id);
  const status = displayStatus(result.status);
  const index = Math.max(0, queue.findIndex((item) => item.id === test.id));
  const nextOpen = nextUnresolved(queue, state.results, test.id);
  const nextCase = adjacentTest(queue, test.id, 1);

  els.runner.innerHTML = `
    <article class="runner">
      <div class="runner__top">
        <button type="button" data-back>← Full list</button>
        <strong>${escapeHtml(state.runner.mode === "section" && section ? sectionLabel(section) : title)}</strong>
      </div>
      <p class="runner__overall">
        Overall: ${overall.resolved} / ${overall.total} completed · ${overallRemaining} remaining
        <button type="button" class="linkish" data-back>View progress</button>
      </p>
      <p class="runner__meta">Test ${index + 1} of ${queue.length} in this queue · ${counts.resolvedPercent}% of section complete</p>
      <div class="bar"><span style="width:${counts.resolvedPercent}%"></span></div>
      <p class="runner__stats">✓ ${counts.passed} passed · ✕ ${counts.failed} failed · ! ${counts.blocked} blocked · ${remainingCount(counts)} remaining</p>
      <p class="id">${escapeHtml(test.id)} ${test.priority ? `<span class="prio ${escapeHtml(test.priority.toLowerCase())}">${escapeHtml(test.priority)}</span>` : ""} ${goalChips(test.goals)} ${badge(status)}</p>
      <h2>${escapeHtml(test.title)}</h2>
      <p class="muted">${escapeHtml(test.sectionTitle)}${test.subsectionTitle ? ` → ${escapeHtml(test.subsectionTitle)}` : ""}</p>
      <dl class="spec">
        ${specPurpose(test)}
        ${test.where ? `<div class="spec__row"><dt>Where</dt><dd>${escapeHtml(test.where)}</dd></div>` : ""}
        ${test.url ? `<div class="spec__row"><dt>URL</dt><dd><code>${escapeHtml(test.url)}</code></dd></div>` : ""}
        ${test.given ? `<div class="spec__row given"><dt>Given</dt><dd>${escapeHtml(test.given)}</dd></div>` : ""}
        ${test.when ? `<div class="spec__row when"><dt>When</dt><dd>${escapeHtml(test.when)}</dd></div>` : ""}
        ${test.then || test.expectedResult ? `<div class="spec__row then"><dt>Then</dt><dd>${escapeHtml(test.then || test.expectedResult)}</dd></div>` : ""}
      </dl>
      <div class="runner__result">
        <button type="button" data-status="passed" data-id="${escapeHtml(test.id)}" aria-pressed="${status === "passed"}">✓ Pass</button>
        <button type="button" data-status="failed" data-id="${escapeHtml(test.id)}" aria-pressed="${status === "failed"}">✕ Fail</button>
        <button type="button" data-status="blocked" data-id="${escapeHtml(test.id)}" aria-pressed="${status === "blocked"}">! Blocked</button>
        <button type="button" data-status="skipped" data-id="${escapeHtml(test.id)}" aria-pressed="${status === "skipped"}">— Skip</button>
      </div>
      <p class="muted">Next: ${escapeHtml(nextCase?.id || "end of queue")} · Next untested: ${escapeHtml(nextOpen && nextOpen.id !== test.id ? nextOpen.id : "none")}</p>
      <div class="runner__nav">
        <button type="button" data-back>← Full list</button>
        <button type="button" data-step="-1">← Previous</button>
        <span>${index + 1} / ${queue.length}</span>
        <div>
          <button type="button" data-next-untested>Next untested →</button>
          <button type="button" data-step="1">Next →</button>
        </div>
      </div>
      <label class="auto-next"><input type="checkbox" data-auto-next ${state.runner.autoNext ? "checked" : ""} /> Automatically move to next test</label>
      <label class="field"><span>Tester notes</span><textarea data-field="notes" data-id="${escapeHtml(test.id)}">${escapeHtml(result.notes)}</textarea></label>
      <p class="muted">Updated ${escapeHtml(formatTime(result.updatedAt) || "—")} · <button type="button" data-copy-link="${escapeHtml(test.id)}">Copy link</button> ${status === "failed" ? `<button type="button" data-copy-failure="${escapeHtml(test.id)}">Copy failure report</button>` : ""}</p>
    </article>
    <div class="runner-sticky">
      <button type="button" data-status="passed" data-id="${escapeHtml(test.id)}">✓ Pass</button>
      <button type="button" data-status="failed" data-id="${escapeHtml(test.id)}">✕ Fail</button>
      <button type="button" data-status="blocked" data-id="${escapeHtml(test.id)}">! Blocked</button>
      <button type="button" data-status="skipped" data-id="${escapeHtml(test.id)}">— Skip</button>
    </div>`;
}

function render() {
  if (!state.definitions) return;
  ensureCollapseDefaults();
  els.title.textContent = state.definitions.title || "Offload Test Cases";
  document.title = state.definitions.title || "Offload Test Cases";
  renderShell();
  renderHeaderProgress();
  if (state.screen === "runner") {
    renderRunner();
    return;
  }
  renderOverview();
  renderSidebar();
  renderList();
  renderDetail();
  applyPopovers();
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
  const id = deepLinkId();
  if (id && findTest(id)) selectTest(id);
}

async function start() {
  restoreRunner();
  try {
    await loadDefinitions();
    await refreshResults({ quiet: true });
    setSync("saved");
    openFromHash();
    if (state.screen === "runner" && findTest(state.runner.testId)) render();
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

function handleStartSection(button) {
  const sectionId = button.dataset.startSection;
  const mode = button.dataset.mode || "section";
  const testId = button.dataset.testId;
  if (testId) {
    openRunner({ mode, sectionId, testId, done: false });
    return;
  }
  startSection(sectionId, mode);
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
els.overviewBtn?.addEventListener("click", closeRunner);
document.querySelector(".top__title")?.addEventListener("click", () => {
  if (state.screen === "runner") closeRunner();
});
document.getElementById("btn-export").addEventListener("click", () => {
  closePopover();
  exportResults();
});
document.getElementById("btn-import").addEventListener("click", () => {
  closePopover();
  els.importFile.click();
});
document.getElementById("btn-keys").addEventListener("click", () => {
  closePopover();
  els.keysModal.hidden = false;
});
document.getElementById("keys-close").addEventListener("click", () => {
  els.keysModal.hidden = true;
});
els.keysModal.addEventListener("click", (event) => {
  if (event.target === els.keysModal) els.keysModal.hidden = true;
});

els.more.addEventListener("click", (event) => {
  event.stopPropagation();
  setPopover("more");
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".more") || event.target.closest(".section-more")) return;
  closePopover();
});
els.sectionsBtn?.addEventListener("click", () => {
  state.sidebarDrawerOpen = true;
  applyDrawer();
});
els.sidebarBackdrop?.addEventListener("click", () => {
  state.sidebarDrawerOpen = false;
  applyDrawer();
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
  state.results = { ...state.results, results: imported.value.results };
  render();
  persist();
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
  state.runner = { mode: "section", sectionId: "", testId: "", autoNext: state.runner.autoNext, done: false };
  persistRunner();
  render();
  persist();
}

document.getElementById("btn-reset-all").addEventListener("click", restartAll);

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});
els.sectionFilter.addEventListener("change", (event) => {
  state.sectionId = event.target.value;
  render();
});
document.getElementById("btn-expand-all").addEventListener("click", () => {
  closePopover();
  state.collapsed.clear();
  persistCollapsed();
  render();
});
document.getElementById("btn-collapse-all").addEventListener("click", () => {
  closePopover();
  for (const section of state.definitions.sections) state.collapsed.add(section.id);
  persistCollapsed();
  render();
});

function handleViewClick(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(state.view === button.dataset.view && button.dataset.view !== "all" ? "all" : button.dataset.view);
}

els.views.addEventListener("click", (event) => {
  if (event.target.closest("[data-retest]")) {
    handleAppClick(event);
    return;
  }
  handleViewClick(event);
});
els.counts.addEventListener("click", handleViewClick);
els.extra?.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]");
  const goal = event.target.closest("[data-goal]");
  if (view) setView(state.view === view.dataset.view ? "all" : view.dataset.view);
  if (goal) {
    state.goal = state.goal === goal.dataset.goal ? "all" : goal.dataset.goal;
    render();
  }
});

els.quick.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]");
  const priority = event.target.closest("[data-priority]");
  if (view) {
    if (view.dataset.view === "all") {
      state.view = "all";
      state.priority = "all";
      state.sectionId = "";
      state.goal = "all";
      render();
      return;
    }
    setView(state.view === view.dataset.view ? "all" : view.dataset.view);
    return;
  }
  if (priority) {
    state.priority = state.priority === priority.dataset.priority ? "all" : priority.dataset.priority;
    if (priority.dataset.priority === "P0" && event.detail === 2) {
      openRunner({ mode: "p0", sectionId: "", testId: firstUnresolved(buildRunnerQueue(state.definitions, state.results, { mode: "p0" }), state.results)?.id || "" });
    }
    render();
  }
});

els.activeFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-clear]");
  if (!button) return;
  if (button.dataset.clear === "view") state.view = "all";
  if (button.dataset.clear === "priority") state.priority = "all";
  if (button.dataset.clear === "section") state.sectionId = "";
  if (button.dataset.clear === "goal") state.goal = "all";
  render();
});

function handleAppClick(event) {
  if (event.target.id === "retry-save") {
    persist();
    return;
  }
  if (event.target.id === "btn-export-complete") {
    exportResults();
    return;
  }
  if (event.target.id === "btn-reset-complete") {
    restartAll();
    return;
  }
  if (event.target.closest("[data-continue]") || event.target.closest("[data-resume]")) {
    continueTesting();
    return;
  }
  const retest = event.target.closest("[data-retest]");
  if (retest) {
    const mode = retest.dataset.retest;
    const queue = buildRunnerQueue(state.definitions, state.results, { mode });
    openRunner({ mode, sectionId: "", testId: queue[0]?.id || "", done: !queue.length });
    return;
  }
  const start = event.target.closest("[data-start-section]");
  if (start) {
    handleStartSection(start);
    return;
  }
  const view = event.target.closest("[data-view]");
  if (view && event.currentTarget === els.complete) setView(view.dataset.view);
}

els.continueCard.addEventListener("click", handleAppClick);
els.complete.addEventListener("click", handleAppClick);
els.sidebar.addEventListener("click", (event) => {
  if (event.target.closest("[data-toggle-sidebar]")) {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    persistSidebar();
    render();
    return;
  }
  if (event.target.closest("[data-close-drawer]")) {
    state.sidebarDrawerOpen = false;
    applyDrawer();
    return;
  }
  const start = event.target.closest("[data-start-section]");
  if (start) {
    handleStartSection(start);
    return;
  }
  const button = event.target.closest("[data-section]");
  if (button) revealSection(button.dataset.section);
});

function handleWorkspaceClick(event) {
  const toggle = event.target.closest("[data-menu-toggle]");
  if (toggle) {
    const menu = toggle.parentElement.querySelector("[data-popover]");
    if (menu?.dataset.popover) setPopover(menu.dataset.popover);
    event.stopPropagation();
    return;
  }
  const bulk = event.target.closest("[data-bulk-action]");
  if (bulk) {
    applyBulk(bulk.dataset.bulkAction, bulk.dataset.section);
    return;
  }
  if (event.target.closest("[data-back]")) {
    closeRunner();
    return;
  }
  if (event.target.closest("[data-continue]") || event.target.closest("[data-resume]")) {
    continueTesting();
    return;
  }
  const start = event.target.closest("[data-start-section]");
  if (start) {
    handleStartSection(start);
    return;
  }
  const copyLink = event.target.closest("[data-copy-link]");
  if (copyLink) {
    copyTestLink(copyLink.dataset.copyLink);
    return;
  }
  const copyFailure = event.target.closest("[data-copy-failure]");
  if (copyFailure) {
    const test = findTest(copyFailure.dataset.copyFailure);
    if (test) navigator.clipboard?.writeText(formatFailureReport(test, getResult(state.results, test.id)));
    return;
  }
  const collapse = event.target.closest("[data-collapse]");
  if (collapse) {
    closePopover();
    const id = collapse.dataset.collapse;
    if (state.collapsed.has(id)) state.collapsed.delete(id);
    else state.collapsed.add(id);
    state.selectedSectionId = id;
    persistCollapsed();
    render();
    return;
  }
  const statusButton = event.target.closest("[data-status]");
  if (statusButton) {
    requestStatus(statusButton.dataset.id, statusButton.dataset.status);
    return;
  }
  const nextUntested = event.target.closest("[data-next-untested]");
  if (nextUntested) {
    const next = nextUnresolved(runnerQueue(), state.results, state.runner.testId);
    if (next) {
      state.runner.testId = next.id;
      state.activeTestId = next.id;
      persistRunner();
      render();
    }
    return;
  }
  const step = event.target.closest("[data-step]");
  if (step) {
    const next = adjacentTest(runnerQueue(), state.runner.testId, Number(step.dataset.step));
    if (next) {
      state.runner.testId = next.id;
      state.runner.done = false;
      state.activeTestId = next.id;
      persistRunner();
      render();
    } else if (Number(step.dataset.step) > 0) {
      state.runner.done = true;
      persistRunner();
      render();
    }
    return;
  }
  const row = event.target.closest("[data-test]");
  if (row) selectTest(row.dataset.test);
}

els.main.addEventListener("click", handleWorkspaceClick);
els.detail.addEventListener("click", handleWorkspaceClick);
els.runner.addEventListener("click", handleWorkspaceClick);
els.runner.addEventListener("change", (event) => {
  if (event.target.dataset.autoNext != null) {
    state.runner.autoNext = event.target.checked;
    persistRunner();
  }
  const field = event.target.dataset.field;
  const id = event.target.dataset.id;
  if (!field || !id) return;
  state.results = upsertResult(state.results, id, { [field]: event.target.value });
  scheduleSave();
});
els.runner.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  const id = event.target.dataset.id;
  if (!field || !id) return;
  state.results = upsertResult(state.results, id, { [field]: event.target.value });
  scheduleSave();
});

async function applyBulk(action, sectionId) {
  closePopover();
  const filter = { sectionId };
  if (action === "continue") {
    startSection(sectionId);
    return;
  }
  if (action === "failed") {
    startSection(sectionId, "failed");
    return;
  }
  if (action === "export") {
    exportResults(filter);
    return;
  }
  if (action === "reset") {
    const ok = await confirmAction(
      "Restart this section?",
      "This will clear results for this section only. Test case definitions stay in the repo.",
      "Restart section"
    );
    if (ok !== true) return;
    state.results = resetResults(state.results, collectTestIds(state.definitions, filter));
    render();
    persist();
  }
}

els.failForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = pendingId || state.runner.testId || state.activeTestId;
  applyStatus([id], "failed", {
    severity: els.failForm.severity.value,
    error: els.failForm.error.value,
    expectedResult: els.failForm.expectedResult.value,
    actualResult: els.failForm.actualResult.value,
    comments: els.failForm.comments.value,
  });
  els.failModal.hidden = true;
  afterResult(id, "failed");
});
document.getElementById("fail-cancel").addEventListener("click", () => {
  els.failModal.hidden = true;
});
els.failModal.addEventListener("click", (event) => {
  if (event.target === els.failModal) els.failModal.hidden = true;
});

els.blockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = pendingId || state.runner.testId || state.activeTestId;
  applyStatus([id], "blocked", {
    blockedReason: els.blockForm.blockedReason.value,
    comments: els.blockForm.comments.value,
  });
  els.blockModal.hidden = true;
  afterResult(id, "blocked");
});
document.getElementById("block-cancel").addEventListener("click", () => {
  els.blockModal.hidden = true;
});
els.blockModal.addEventListener("click", (event) => {
  if (event.target === els.blockModal) els.blockModal.hidden = true;
});

els.banner.addEventListener("click", (event) => {
  if (event.target.id === "retry-save") persist();
});
els.savedAt.addEventListener("click", (event) => {
  if (event.target.id === "retry-save") persist();
});

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "Escape") {
    if (state.openPopover) {
      closePopover();
      return;
    }
    if (state.sidebarDrawerOpen) {
      state.sidebarDrawerOpen = false;
      applyDrawer();
      return;
    }
    const modalOpen = !els.keysModal.hidden || !els.failModal.hidden || !els.blockModal.hidden || !els.modal.hidden;
    if (modalOpen) {
      els.keysModal.hidden = true;
      els.failModal.hidden = true;
      els.blockModal.hidden = true;
      closeModal(false);
      return;
    }
    if (state.screen === "runner") {
      closeRunner();
      return;
    }
    closeModal(false);
    return;
  }
  if (event.key === "Enter" && !els.failModal.hidden) {
    els.failForm.requestSubmit();
    return;
  }
  if (event.key === "Enter" && !els.blockModal.hidden) {
    els.blockForm.requestSubmit();
    return;
  }
  if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
    event.preventDefault();
    els.keysModal.hidden = !els.keysModal.hidden;
    return;
  }
  const id = state.screen === "runner" ? state.runner.testId : state.activeTestId;
  if (event.key === "ArrowRight" && state.screen === "runner") {
    event.preventDefault();
    const next = adjacentTest(runnerQueue(), state.runner.testId, 1);
    if (next) {
      state.runner.testId = next.id;
      persistRunner();
      render();
    }
    return;
  }
  if (event.key === "ArrowLeft" && state.screen === "runner") {
    event.preventDefault();
    const prev = adjacentTest(runnerQueue(), state.runner.testId, -1);
    if (prev) {
      state.runner.testId = prev.id;
      state.runner.done = false;
      persistRunner();
      render();
    }
    return;
  }
  if (event.key.toLowerCase() === "u") {
    event.preventDefault();
    if (state.screen !== "runner") {
      continueTesting();
      return;
    }
    const next = nextUnresolved(runnerQueue(), state.results, state.runner.testId);
    if (next) {
      state.runner.testId = next.id;
      persistRunner();
      render();
    }
    return;
  }
  const keys = { p: "passed", f: "failed", b: "blocked", s: "skipped", i: "in_progress", n: "not_tested" };
  const status = keys[event.key.toLowerCase()];
  if (!status || !id) return;
  event.preventDefault();
  requestStatus(id, status);
});

els.modalCancel.addEventListener("click", () => closeModal(false));
els.modalConfirm.addEventListener("click", () => closeModal(true));
els.modalExtra.addEventListener("click", () => closeModal("export"));
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) closeModal(false);
});

window.addEventListener("hashchange", openFromHash);
window.addEventListener("offline", () => setSync("offline"));
window.addEventListener("online", () => {
  if (state.sync === "offline" || state.sync === "failed") persist();
});
window.setInterval(() => {
  if (state.sync !== "failed") els.savedAt.textContent = formatRelative(state.results.updatedAt);
}, 15000);

start();
