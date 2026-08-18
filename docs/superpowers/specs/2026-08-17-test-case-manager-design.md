# Offload Test Case Manager — Design

Date: 2026-08-17

## Goal

A small Cloudflare Pages app for tracking plugin test cases. Test definitions live in the git repo as JSON. Execution results and comments live in Cloudflare KV. Adding or changing test cases in the repo must not wipe or corrupt stored results.

## Architecture

```
Browser (HTML/CSS/JS)
  → GET /data/test-cases.json     (static definitions)
  → GET/PUT /api/results          (Pages Function)
      → Cloudflare KV binding TEST_RESULTS
```

No frontend framework. No auth. No database other than KV.

## Data split

### Definitions (repo)

`public/data/test-cases.json` is the catalog. It contains sections, subsections, titles, descriptions, and expected results. It never contains status, notes, or errors.

Stable `id` values are the join key. Renaming an id orphans old results (ignored, not fatal). Adding a new id shows as Not Tested. Removing an id hides it from the UI; leftover KV entries are ignored.

### Results (KV)

Single KV key `test-results`:

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "updatedAt": "ISO-8601",
  "results": {
    "s3-connect": {
      "status": "failed",
      "notes": "",
      "error": "",
      "errorDetails": "",
      "expectedResult": "",
      "actualResult": "",
      "comments": "",
      "updatedAt": "ISO-8601"
    }
  }
}
```

Missing ids mean `not_tested`. Empty or absent KV is a fresh run.

## Compatibility (updates must not break the system)

- Merge is always by test id. Unknown result ids are ignored. Unknown definition fields are ignored.
- New optional definition fields default to `""`.
- Unknown status strings are shown as Not Tested in the UI but are not rewritten until the user changes them.
- Extra JSON fields on results are preserved on save (forward compatible).
- Invalid PUT bodies are rejected with 400; KV is left unchanged.
- Corrupt KV JSON is not auto-repaired. GET returns 500. The UI keeps local state and offers retry. Full restart (empty results PUT) is the repair path.
- Deploying a new `test-cases.json` never writes KV.
- Full restart writes `{ schemaVersion: 1, revision: n+1, results: {} }`.
- Section restart deletes result keys for that section’s current definition ids only.

## API

`GET /api/results` — current results doc, or empty doc if KV has no key.

`PUT /api/results` — body `{ revision, results }`. If `revision` does not match stored revision, respond 409 with the current doc. On success, increment revision and persist.

No other mutation endpoints. Section reset and full reset are computed in the client, then saved with PUT.

## UI

Vanilla single page: overall progress, filters, collapsible sections/subsections, per-test status, failure fields when Failed, bulk section actions with overwrite confirmation, import/export of results JSON, save/sync indicator.

Completed count = tests whose status is not `not_tested`. Percent = completed / total.

## Deploy

GitHub Actions + `wrangler pages deploy`. KV namespace id is not committed. Production binding is injected in CI from `CLOUDFLARE_KV_NAMESPACE_ID`. Local `wrangler pages dev` uses `--kv=TEST_RESULTS`.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_KV_NAMESPACE_ID`
