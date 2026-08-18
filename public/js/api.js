const ENDPOINT = "/api/results";

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw Object.assign(new Error("The server returned invalid JSON."), { status: response.status });
    }
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function loadResults() {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  return parseResponse(response);
}

export async function saveResults(resultsDoc) {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      revision: resultsDoc.revision,
      results: resultsDoc.results,
    }),
  });
  return parseResponse(response);
}
