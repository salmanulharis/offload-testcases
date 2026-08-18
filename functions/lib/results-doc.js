function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  if (value == null) return "";
  return String(value);
}

const RESULT_FIELDS = [
  "status",
  "notes",
  "error",
  "errorDetails",
  "expectedResult",
  "actualResult",
  "comments",
  "severity",
  "updatedAt",
];

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
    updatedAt: null,
  };
}

export function emptyResultsDoc() {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    results: {},
  };
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
  doc.schemaVersion = Number.isFinite(Number(raw.schemaVersion)) ? Number(raw.schemaVersion) : 1;
  doc.revision = Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0;
  doc.updatedAt = raw.updatedAt ? asString(raw.updatedAt) : null;
  const resultsIn = isObject(raw.results) ? raw.results : {};
  for (const [id, value] of Object.entries(resultsIn)) {
    if (!id) continue;
    doc.results[id] = normalizeResult(value);
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
      }
    }
  }
  if (raw.revision != null && !Number.isFinite(Number(raw.revision))) {
    errors.push("revision must be a number.");
  }
  if (errors.length) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: normalizeResultsDoc(raw) };
}
