import test from "node:test";
import assert from "node:assert/strict";
import {
  collectTestIds,
  countStatuses,
  emptyResultsDoc,
  extractImportedResults,
  flattenTestCases,
  getResult,
  normalizeResultsDoc,
  overwriteRisk,
  resetResults,
  upsertResult,
  validateDefinitions,
  validateResultsDoc,
} from "../public/js/schema.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const definitions = JSON.parse(
  readFileSync(join(root, "public/data/test-cases.json"), "utf8")
);

const REQUIRED_IDS = [
  "TC-ENV-01", "TC-ENV-02", "TC-ENV-03", "TC-ENV-04", "TC-ENV-05", "TC-ENV-06",
  "SETUP-NEW-IMG", "SETUP-NEW-PDF", "SETUP-NEW-LARGE", "SETUP-LOCAL-ONLY",
  "SETUP-LEGACY", "SETUP-TO-FAIL", "SETUP-TO-VERIFY", "SETUP-VERIFIED-1",
  "SETUP-LOCAL-GONE", "SETUP-PRIVATE-DL", "SETUP-WEBP",
  "TC-DASH-01", "TC-DASH-02", "TC-DASH-03", "TC-DASH-04", "TC-DASH-05", "TC-DASH-06", "TC-DASH-07",
  "TC-VER-01", "TC-VER-02", "TC-VER-03", "TC-VER-04", "TC-VER-05", "TC-VER-06", "TC-VER-07", "TC-VER-08",
  "TC-ML-01", "TC-ML-02", "TC-ML-03", "TC-ML-04", "TC-ML-05", "TC-ML-06", "TC-ML-07",
  "TC-ML-08", "TC-ML-09", "TC-ML-10", "TC-ML-11", "TC-ML-12", "TC-ML-13",
  "TC-DEL-01", "TC-DEL-02", "TC-DEL-03", "TC-DEL-04", "TC-DEL-05", "TC-DEL-06", "TC-DEL-07",
  "TC-WOO-01", "TC-WOO-02", "TC-WOO-03",
  "TC-EDD-01", "TC-EDD-02",
  "TC-CLI-01", "TC-CLI-02", "TC-CLI-03", "TC-CLI-04", "TC-CLI-05", "TC-CLI-06",
  "TC-CLI-07", "TC-CLI-08", "TC-CLI-09", "TC-CLI-10", "TC-CLI-11",
  "TC-CSV-01", "TC-CSV-02", "TC-CSV-03", "TC-CSV-04", "TC-CSV-05",
  "TC-REG-01", "TC-REG-02", "TC-REG-03", "TC-REG-04", "TC-REG-05", "TC-REG-06", "TC-REG-07", "TC-REG-08",
  "TC-ERR-01", "TC-ERR-02", "TC-ERR-03", "TC-ERR-04", "TC-ERR-05",
  "TC-CACHE-01", "TC-CACHE-02",
  "TC-SA-01", "TC-SA-02", "TC-SA-03", "TC-SA-04", "TC-SA-05",
  "TC-FM-01", "TC-FM-02", "TC-FM-03", "TC-FM-04", "TC-FM-05",
  "TC-TS-01", "TC-TS-02", "TC-TS-03",
  "TC-PROV-S3", "TC-PROV-R2", "TC-PROV-GCS", "TC-PROV-SPACES", "TC-PROV-WASABI", "TC-PROV-MINIO",
  "TC-POL-01", "TC-POL-02", "TC-POL-03", "TC-POL-04",
];

test("6.2.0 catalog loads with unique original ids", () => {
  const { ok, errors, tests } = validateDefinitions(definitions);
  assert.equal(ok, true, errors.join("; "));
  assert.equal(tests.length, 111);
  const ids = tests.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of REQUIRED_IDS) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
});

test("flatten preserves section and Given/When/Then", () => {
  const tests = flattenTestCases(definitions);
  const env = tests.find((item) => item.id === "TC-ENV-01");
  assert.equal(env.sectionId, "environment");
  assert.equal(env.subsectionId, "smoke");
  assert.match(env.given, /delete-local/);
  assert.match(env.then, /Do not run mass remove/);
});

test("missing KV results mean not_tested and do not drop definitions", () => {
  const counts = countStatuses(definitions, emptyResultsDoc());
  assert.equal(counts.total, flattenTestCases(definitions).length);
  assert.equal(counts.not_tested, counts.total);
  assert.equal(counts.completed, 0);
});

test("orphan KV results for removed ids are ignored", () => {
  const doc = normalizeResultsDoc({
    revision: 3,
    results: {
      "TC-ENV-01": { status: "passed" },
      "deleted-old-test": { status: "failed", error: "gone" },
    },
  });
  const counts = countStatuses(definitions, doc);
  assert.equal(counts.passed, 1);
  assert.equal(counts.failed, 0);
  assert.equal(getResult(doc, "deleted-old-test").status, "failed");
});

test("unknown extra result fields are preserved", () => {
  const doc = normalizeResultsDoc({
    results: {
      "TC-ENV-01": { status: "passed", screenshot: "a.png" },
    },
  });
  assert.equal(doc.results["TC-ENV-01"].screenshot, "a.png");
});

test("unknown status does not crash counts", () => {
  const doc = {
    results: { "TC-ENV-01": { status: "needs_review" } },
  };
  const counts = countStatuses(definitions, doc);
  assert.equal(counts.unknown, 1);
  assert.equal(counts.completed, 0);
  assert.equal(counts.not_tested, counts.total);
});

test("invalid results payload is rejected", () => {
  const bad = validateResultsDoc({ results: "nope" });
  assert.equal(bad.ok, false);
  const good = validateResultsDoc({ revision: 1, results: {} });
  assert.equal(good.ok, true);
  assert.equal(good.value.revision, 1);
});

test("section reset clears only that section", () => {
  let doc = emptyResultsDoc();
  doc = upsertResult(doc, "TC-ENV-01", { status: "passed" });
  doc = upsertResult(doc, "TC-DASH-01", { status: "failed", error: "denied" });
  doc = upsertResult(doc, "TC-ML-01", { status: "passed" });
  doc = resetResults(doc, collectTestIds(definitions, { sectionId: "environment" }));
  assert.equal(getResult(doc, "TC-ENV-01").status, "not_tested");
  assert.equal(getResult(doc, "TC-DASH-01").status, "failed");
  assert.equal(getResult(doc, "TC-ML-01").status, "passed");
});

test("full reset clears results but definitions still count", () => {
  let doc = upsertResult(emptyResultsDoc(), "TC-ENV-01", { status: "passed" });
  doc = resetResults(doc, null);
  assert.deepEqual(doc.results, {});
  const counts = countStatuses(definitions, doc);
  assert.equal(counts.total, flattenTestCases(definitions).length);
  assert.equal(counts.not_tested, counts.total);
});

test("import rejects definition files", () => {
  const imported = extractImportedResults(definitions);
  assert.equal(imported.ok, false);
});

test("import accepts results-only and combined snapshots", () => {
  const resultsOnly = extractImportedResults({
    revision: 4,
    results: { "TC-ENV-01": { status: "blocked", comments: "waiting" } },
  });
  assert.equal(resultsOnly.ok, true);
  assert.equal(resultsOnly.value.results["TC-ENV-01"].status, "blocked");

  const combined = extractImportedResults({
    sections: definitions.sections,
    results: { "TC-ENV-01": { status: "passed" } },
  });
  assert.equal(combined.ok, true);
});

test("adding a new definition id needs no KV migration", () => {
  const extra = structuredClone(definitions);
  extra.sections[0].subsections[0].testCases.push({
    id: "TC-ENV-NEW",
    title: "New check",
    description: "Added later",
    expectedResult: "Works",
  });
  const doc = normalizeResultsDoc({
    results: { "TC-ENV-01": { status: "passed" } },
  });
  const before = countStatuses(definitions, doc);
  const after = countStatuses(extra, doc);
  assert.equal(after.total, before.total + 1);
  assert.equal(after.passed, before.passed);
  assert.equal(getResult(doc, "TC-ENV-NEW").status, "not_tested");
});

test("overwrite risk detects failed details", () => {
  const doc = upsertResult(emptyResultsDoc(), "TC-ENV-01", {
    status: "failed",
    error: "AccessDenied",
  });
  const risk = overwriteRisk(definitions, doc, { sectionId: "environment", subsectionId: "smoke" });
  assert.equal(risk.failed, 1);
  assert.ok(risk.withDetails >= 1);
});
