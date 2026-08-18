import {
  emptyResultsDoc,
  normalizeResultsDoc,
  validateResultsDoc,
} from "../../public/js/schema.js";

const KEY = "test-results";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function kvMissing() {
  return json(
    {
      error: "KV binding TEST_RESULTS is not configured.",
      hint: "In Cloudflare Pages, add a KV namespace binding named TEST_RESULTS. For GitHub deploys, set CLOUDFLARE_KV_NAMESPACE_ID.",
    },
    503
  );
}

async function readDoc(env) {
  let raw;
  try {
    raw = await env.TEST_RESULTS.get(KEY);
  } catch (error) {
    return { ok: false, error: `KV read failed: ${error.message || error}` };
  }
  if (raw == null || raw === "") {
    return { ok: true, empty: true, doc: emptyResultsDoc() };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "Stored KV JSON is corrupt. Retry, or use Restart Full Test to replace it.",
    };
  }
  return { ok: true, empty: false, doc: normalizeResultsDoc(parsed) };
}

export async function onRequestGet({ env }) {
  if (!env.TEST_RESULTS) return kvMissing();
  const read = await readDoc(env);
  if (!read.ok) return json({ error: read.error }, 500);
  return json(read.doc);
}

export async function onRequestPut({ request, env }) {
  if (!env.TEST_RESULTS) return kvMissing();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const validated = validateResultsDoc(body);
  if (!validated.ok) {
    return json({ error: "Invalid results document.", details: validated.errors }, 400);
  }

  const incoming = validated.value;
  if (!Number.isFinite(Number(body.revision))) {
    return json({ error: "revision is required for optimistic locking." }, 400);
  }

  const read = await readDoc(env);
  if (!read.ok) return json({ error: read.error }, 500);

  const current = read.doc;
  if (Number(body.revision) !== current.revision) {
    return json(
      {
        error: "Conflict: results were updated elsewhere.",
        current,
      },
      409
    );
  }

  const saved = {
    schemaVersion: 1,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    results: incoming.results,
  };

  try {
    await env.TEST_RESULTS.put(KEY, JSON.stringify(saved));
  } catch (error) {
    return json({ error: `KV write failed: ${error.message || error}` }, 502);
  }
  return json(saved);
}
