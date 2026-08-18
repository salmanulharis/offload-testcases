export const STATUSES = [
  "not_tested",
  "in_progress",
  "passed",
  "failed",
  "blocked",
  "skipped",
];

export const STATUS_LABELS = {
  not_tested: "Not Tested",
  in_progress: "In Progress",
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  skipped: "Skipped / N/A",
};

export const STATUS_MARKS = {
  not_tested: "○",
  in_progress: "◐",
  passed: "✓",
  failed: "✕",
  blocked: "!",
  skipped: "—",
};

export const RESOLVED_STATUSES = ["passed", "failed", "blocked", "skipped"];

export const RESULT_FIELDS = [
  "status",
  "notes",
  "error",
  "errorDetails",
  "expectedResult",
  "actualResult",
  "comments",
  "severity",
  "blockedReason",
  "updatedAt",
];

export const BLOCKED_REASONS = [
  "Environment unavailable",
  "Dependency unavailable",
  "Bug blocking test",
  "Credentials",
  "Other",
];

const KV_SCHEMA_VERSION = 1;
const DEFINITION_VERSION = 1;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  if (value == null) return "";
  return String(value);
}

export function emptyResult() {
  return {
    status: "not_tested",
    notes: "",
    error: "",
    errorDetails: "",
    expectedResult: "",
    actualResult: "",
    comments: "",
    severity: "",
    blockedReason: "",
    updatedAt: null,
  };
}

export function emptyResultsDoc() {
  return {
    schemaVersion: KV_SCHEMA_VERSION,
    revision: 0,
    updatedAt: null,
    results: {},
  };
}

export function isKnownStatus(status) {
  return STATUSES.includes(status);
}

export function displayStatus(status) {
  return isKnownStatus(status) ? status : "not_tested";
}

export function normalizeResult(raw) {
  const base = emptyResult();
  if (!isObject(raw)) return base;

  const status = asString(raw.status).trim() || "not_tested";
  const result = {
    ...base,
    status,
    notes: asString(raw.notes),
    error: asString(raw.error),
    errorDetails: asString(raw.errorDetails),
    expectedResult: asString(raw.expectedResult),
    actualResult: asString(raw.actualResult),
    comments: asString(raw.comments),
    severity: asString(raw.severity),
    blockedReason: asString(raw.blockedReason),
    updatedAt: raw.updatedAt ? asString(raw.updatedAt) : null,
  };

  for (const [key, value] of Object.entries(raw)) {
    if (!RESULT_FIELDS.includes(key) && !(key in result)) {
      result[key] = value;
    }
  }

  return result;
}

export function normalizeResultsDoc(raw) {
  const doc = emptyResultsDoc();
  if (!isObject(raw)) return doc;

  const revision = Number(raw.revision);
  doc.schemaVersion = Number.isFinite(Number(raw.schemaVersion))
    ? Number(raw.schemaVersion)
    : KV_SCHEMA_VERSION;
  doc.revision = Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0;
  doc.updatedAt = raw.updatedAt ? asString(raw.updatedAt) : null;

  const resultsIn = isObject(raw.results) ? raw.results : {};
  for (const [id, value] of Object.entries(resultsIn)) {
    if (!id) continue;
    doc.results[id] = normalizeResult(value);
  }

  for (const [key, value] of Object.entries(raw)) {
    if (!(key in doc)) doc[key] = value;
  }

  return doc;
}

export function validateResultsDoc(raw) {
  const errors = [];
  if (!isObject(raw)) {
    return { ok: false, errors: ["Results document must be an object."], value: null };
  }
  if (raw.results == null || !isObject(raw.results)) {
    errors.push("results must be an object keyed by test case id.");
  } else {
    for (const [id, value] of Object.entries(raw.results)) {
      if (typeof id !== "string" || !id.trim()) {
        errors.push("Every result key must be a non-empty test case id.");
        break;
      }
      if (!isObject(value)) {
        errors.push(`Result "${id}" must be an object.`);
        continue;
      }
      if (value.status != null && typeof value.status !== "string") {
        errors.push(`Result "${id}" status must be a string.`);
      }
    }
  }
  if (raw.revision != null && !Number.isFinite(Number(raw.revision))) {
    errors.push("revision must be a number.");
  }
  if (errors.length) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: normalizeResultsDoc(raw) };
}

export function normalizeGoals(value) {
  if (Array.isArray(value)) return value.map(asString).map((item) => item.trim()).filter(Boolean);
  return asString(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTestCase(testCase, section, subsectionId, subsectionTitle) {
  const sectionId = asString(section.id);
  const sectionTitle = asString(section.title) || sectionId;
  return {
    ...testCase,
    id: asString(testCase.id),
    title: asString(testCase.title) || asString(testCase.id),
    description: asString(testCase.description || testCase.when),
    expectedResult: asString(testCase.expectedResult || testCase.then),
    where: asString(testCase.where),
    url: asString(testCase.url),
    given: asString(testCase.given),
    when: asString(testCase.when),
    then: asString(testCase.then),
    priority: asString(testCase.priority),
    purpose: asString(testCase.purpose || section.purpose),
    goals: normalizeGoals(testCase.goals?.length ? testCase.goals : section.goals),
    failImpact: asString(testCase.failImpact),
    sectionId,
    sectionTitle,
    sectionPurpose: asString(section.purpose),
    subsectionId,
    subsectionTitle,
  };
}

export function flattenTestCases(definitions) {
  const tests = [];
  if (!isObject(definitions) || !Array.isArray(definitions.sections)) return tests;

  for (const section of definitions.sections) {
    if (!isObject(section)) continue;

    const directCases = Array.isArray(section.testCases) ? section.testCases : [];
    for (const testCase of directCases) {
      if (!isObject(testCase) || !testCase.id) continue;
      tests.push(normalizeTestCase(testCase, section, "", ""));
    }

    const subsections = Array.isArray(section.subsections) ? section.subsections : [];
    for (const subsection of subsections) {
      if (!isObject(subsection)) continue;
      const subsectionId = asString(subsection.id);
      const subsectionTitle = asString(subsection.title) || subsectionId;
      const cases = Array.isArray(subsection.testCases) ? subsection.testCases : [];
      for (const testCase of cases) {
        if (!isObject(testCase) || !testCase.id) continue;
        tests.push(normalizeTestCase(testCase, section, subsectionId, subsectionTitle));
      }
    }
  }

  return tests;
}

export function validateDefinitions(raw) {
  const errors = [];
  if (!isObject(raw)) {
    return { ok: false, errors: ["Definitions must be an object."], tests: [] };
  }
  if (!Array.isArray(raw.sections)) {
    return { ok: false, errors: ["definitions.sections must be an array."], tests: [] };
  }

  const seen = new Set();
  const tests = flattenTestCases(raw);
  if (!tests.length) errors.push("No test cases found in definitions.");
  for (const test of tests) {
    if (seen.has(test.id)) errors.push(`Duplicate test case id: ${test.id}`);
    seen.add(test.id);
  }

  return { ok: errors.length === 0, errors, tests };
}

export function getResult(resultsDoc, testId) {
  const doc = normalizeResultsDoc(resultsDoc);
  return doc.results[testId] ? normalizeResult(doc.results[testId]) : emptyResult();
}

export function upsertResult(resultsDoc, testId, patch) {
  const doc = normalizeResultsDoc(resultsDoc);
  const current = getResult(doc, testId);
  const next = normalizeResult({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  return {
    ...doc,
    results: {
      ...doc.results,
      [testId]: next,
    },
  };
}

export function resetResults(resultsDoc, testIds) {
  const doc = normalizeResultsDoc(resultsDoc);
  if (!testIds) {
    return { ...doc, results: {} };
  }
  const next = { ...doc.results };
  for (const id of testIds) {
    delete next[id];
  }
  return { ...doc, results: next };
}

export function collectTestIds(definitions, filter = {}) {
  const tests = flattenTestCases(definitions);
  return tests
    .filter((test) => {
      if (filter.sectionId && test.sectionId !== filter.sectionId) return false;
      if (filter.subsectionId && test.subsectionId !== filter.subsectionId) return false;
      return true;
    })
    .map((test) => test.id);
}

export function countStatuses(definitions, resultsDoc) {
  const tests = flattenTestCases(definitions);
  const counts = {
    total: tests.length,
    completed: 0,
    not_tested: 0,
    in_progress: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    unknown: 0,
    resolved: 0,
  };

  for (const test of tests) {
    const result = getResult(resultsDoc, test.id);
    const status = displayStatus(result.status);
    if (!isKnownStatus(result.status)) counts.unknown += 1;
    counts[status] += 1;
    if (status !== "not_tested") counts.completed += 1;
    if (RESOLVED_STATUSES.includes(status)) counts.resolved += 1;
  }

  counts.resolved = counts.resolved || 0;
  counts.remaining = counts.not_tested + counts.in_progress;
  counts.percent = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  counts.resolvedPercent = counts.total ? Math.round((counts.resolved / counts.total) * 100) : 0;
  return counts;
}

export function resultHasDetails(result) {
  const value = normalizeResult(result);
  return Boolean(
    value.notes ||
      value.error ||
      value.errorDetails ||
      value.actualResult ||
      value.comments ||
      (value.expectedResult && value.status === "failed")
  );
}

export function overwriteRisk(definitions, resultsDoc, filter = {}) {
  const ids = collectTestIds(definitions, filter);
  let existing = 0;
  let withDetails = 0;
  let failed = 0;
  for (const id of ids) {
    const result = getResult(resultsDoc, id);
    if (result.status !== "not_tested") existing += 1;
    if (result.status === "failed") failed += 1;
    if (resultHasDetails(result)) withDetails += 1;
  }
  return { ids, existing, withDetails, failed };
}

export function extractImportedResults(raw) {
  if (!isObject(raw)) {
    return { ok: false, errors: ["Imported file must be a JSON object."] };
  }

  if (Array.isArray(raw.sections) && raw.results == null) {
    return {
      ok: false,
      errors: [
        "This file looks like test-case definitions, not results. Results belong in KV; definitions stay in the repo.",
      ],
    };
  }

  if (
    raw.results == null &&
    Object.keys(raw).some((key) => RESULT_FIELDS.includes(key))
  ) {
    return { ok: false, errors: ["Import a results document, not a single test case object."] };
  }

  const candidate = isObject(raw.results)
    ? {
        schemaVersion: raw.schemaVersion,
        revision: raw.revision,
        updatedAt: raw.updatedAt,
        results: raw.results,
      }
    : { results: raw };

  return validateResultsDoc(candidate);
}

export function matchesQuery(test, result, { query = "", status = "all", priority = "all", view = "all", sectionId = "", goal = "all" } = {}) {
  if (sectionId && test.sectionId !== sectionId) return false;
  if (goal && goal !== "all" && !(test.goals || []).includes(goal)) return false;
  const shown = displayStatus(result.status);
  if (view === "todo" && !isWorkStatus(shown)) return false;
  if (view !== "all" && view !== "todo" && shown !== view) return false;
  if (view === "all" && status !== "all" && shown !== status) return false;
  if (priority !== "all" && asString(test.priority) !== priority) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [test.id, test.title, test.description, test.where, test.url, test.given, test.when, test.then, test.purpose, test.failImpact, ...(test.goals || []), test.sectionTitle, test.subsectionTitle]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function isWorkStatus(status) {
  const shown = displayStatus(status);
  return shown === "not_tested" || shown === "in_progress";
}

export function remainingCount(counts) {
  return (counts.not_tested || 0) + (counts.in_progress || 0);
}

export function runOutcome(counts) {
  if (remainingCount(counts) > 0) return "in_progress";
  if ((counts.failed || 0) > 0 || (counts.blocked || 0) > 0) return "failed";
  return "passed";
}

export function countByPriority(definitions, resultsDoc) {
  const tests = flattenTestCases(definitions);
  const out = {};
  for (const test of tests) {
    const key = asString(test.priority) || "other";
    if (!out[key]) out[key] = { total: 0, completed: 0, not_tested: 0 };
    out[key].total += 1;
    const status = displayStatus(getResult(resultsDoc, test.id).status);
    if (status !== "not_tested") out[key].completed += 1;
    if (status === "not_tested") out[key].not_tested += 1;
  }
  return out;
}

function workRank(test, resultsDoc) {
  const status = displayStatus(getResult(resultsDoc, test.id).status);
  const priority = test.priority === "P0" ? 0 : test.priority === "P1" ? 1 : 2;
  return status === "not_tested" ? priority : 10 + priority;
}

export function firstWorkItem(definitions, resultsDoc) {
  const work = flattenTestCases(definitions).filter((test) =>
    isWorkStatus(getResult(resultsDoc, test.id).status)
  );
  work.sort((left, right) => workRank(left, resultsDoc) - workRank(right, resultsDoc));
  return work[0] || null;
}

export function nextWorkItem(definitions, resultsDoc, fromId) {
  const tests = flattenTestCases(definitions);
  const isWork = (test) => isWorkStatus(getResult(resultsDoc, test.id).status);
  if (!fromId) return firstWorkItem(definitions, resultsDoc);
  const fromIndex = tests.findIndex((test) => test.id === fromId);
  return tests.slice(fromIndex + 1).find(isWork) || firstWorkItem(definitions, resultsDoc);
}

export function adjacentTest(tests, fromId, delta) {
  if (!tests.length) return null;
  const index = tests.findIndex((test) => test.id === fromId);
  if (index === -1) return tests[0];
  const next = index + delta;
  if (next < 0 || next >= tests.length) return null;
  return tests[next];
}

export function isResolvedStatus(status) {
  return RESOLVED_STATUSES.includes(displayStatus(status));
}

export function testsInSection(definitions, sectionId) {
  return flattenTestCases(definitions).filter((test) => test.sectionId === sectionId);
}

export function firstIncompleteSection(definitions, resultsDoc) {
  const sections = definitions?.sections || [];
  return (
    sections.find((section) => remainingCount(countStatuses({ sections: [section] }, resultsDoc)) > 0) ||
    null
  );
}

export function nextIncompleteSection(definitions, resultsDoc, fromSectionId) {
  const sections = definitions?.sections || [];
  const index = sections.findIndex((section) => section.id === fromSectionId);
  return (
    sections.slice(index + 1).find((section) => remainingCount(countStatuses({ sections: [section] }, resultsDoc)) > 0) ||
    firstIncompleteSection(definitions, resultsDoc)
  );
}

export function firstUnresolved(tests, resultsDoc) {
  const inProgress = tests.find((test) => displayStatus(getResult(resultsDoc, test.id).status) === "in_progress");
  if (inProgress) return inProgress;
  return tests.find((test) => displayStatus(getResult(resultsDoc, test.id).status) === "not_tested") || null;
}

export function nextUnresolved(tests, resultsDoc, fromId) {
  const index = tests.findIndex((test) => test.id === fromId);
  const after = tests.slice(index + 1).find((test) => isWorkStatus(getResult(resultsDoc, test.id).status));
  return after || firstUnresolved(tests, resultsDoc);
}

export function buildRunnerQueue(definitions, resultsDoc, { mode = "section", sectionId = "", priority = "all" } = {}) {
  let tests = flattenTestCases(definitions);
  if (sectionId) tests = tests.filter((test) => test.sectionId === sectionId);
  if (priority !== "all") tests = tests.filter((test) => test.priority === priority);
  if (mode === "p0") tests = tests.filter((test) => test.priority === "P0");
  if (mode === "failed") tests = tests.filter((test) => displayStatus(getResult(resultsDoc, test.id).status) === "failed");
  if (mode === "blocked") tests = tests.filter((test) => displayStatus(getResult(resultsDoc, test.id).status) === "blocked");
  if (mode === "todo") tests = tests.filter((test) => isWorkStatus(getResult(resultsDoc, test.id).status));
  return tests;
}

export function formatFailureReport(test, result) {
  const value = normalizeResult(result);
  return [
    `${test.id} — ${test.title}`,
    test.goals?.length ? `Goal: ${test.goals.join(", ")}` : "",
    test.purpose ? `Purpose: ${test.purpose}` : "",
    `Severity: ${value.severity || "—"}`,
    `Expected: ${value.expectedResult || test.then || test.expectedResult || "—"}`,
    `Actual: ${value.actualResult || "—"}`,
    `Error: ${value.error || "—"}`,
    value.errorDetails ? `Details: ${value.errorDetails}` : "",
    value.comments ? `Comments: ${value.comments}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export { DEFINITION_VERSION, KV_SCHEMA_VERSION };
