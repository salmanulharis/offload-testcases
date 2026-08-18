# Offload Test Cases

A small HTML checklist for tracking plugin tests. Hosted on Cloudflare Pages. Test **definitions** live in the repo. Test **results and comments** live in Cloudflare KV.

Adding or replacing `public/data/test-cases.json` does not clear KV. Restarting a section or the full run only changes results.

## Local

```bash
npm test
npm run dev
```

Or:

```bash
npx wrangler pages dev public --kv=TEST_RESULTS --compatibility-date=2026-08-17
```

Open the URL Wrangler prints (usually `http://127.0.0.1:8788`). Local KV is separate from production. Wrangler is downloaded via `npx`; tests need only Node.

## Production setup

You need a [Cloudflare account](https://dash.cloudflare.com/sign-up) and this project in a GitHub repository. Then collect three values and store them as **GitHub repository secrets**. Do not commit them.

| GitHub secret | What it is | Where you get it |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 32-character account id | Cloudflare dashboard |
| `CLOUDFLARE_API_TOKEN` | Token that can deploy Pages | Cloudflare **API Tokens** page |
| `CLOUDFLARE_KV_NAMESPACE_ID` | Id of the KV namespace used as `TEST_RESULTS` | Workers KV dashboard or Wrangler |

Docs:

- [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
- [Create an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Deploy Pages with GitHub Actions](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Workers KV](https://developers.cloudflare.com/kv/get-started/)
- [GitHub repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)

### 1. Cloudflare account ID → `CLOUDFLARE_ACCOUNT_ID`

This is **not** a Zone ID (zone ids belong to a domain).

**Option A — search**

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Press `Ctrl+K` / `Cmd+K`, type `Copy account ID`, and copy it.

**Option B — Workers & Pages**

1. Open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
2. In **Account details**, copy **Account ID**.

It is a 32-character hex string. Official steps: [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

### 2. API token → `CLOUDFLARE_API_TOKEN`

Cloudflare shows the token **once**. Copy it immediately.

1. Open [API Tokens](https://dash.cloudflare.com/profile/api-tokens) (**My Profile → API Tokens**).
   Account-owned tokens: [Manage Account → API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens).
2. Select **Create Token**.
3. Either:
   - **Edit Cloudflare Workers** → **Use template** (includes Pages/Workers), or
   - **Create Custom Token** → **Get started** and add:
     - **Account** → **Cloudflare Pages** → **Edit**
     - **Account** → **Workers KV Storage** → **Edit** (so deploy can bind the namespace)
4. Under **Account Resources**, include the account you will deploy to.
5. **Continue to summary** → **Create Token** → copy the value.

Official Pages steps: [Generate an API token](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/#generate-an-api-token).

### 3. KV namespace ID → `CLOUDFLARE_KV_NAMESPACE_ID`

The app Function expects a KV binding named `TEST_RESULTS`. Create a namespace, then copy its **id** (not the title).

**Dashboard**

1. Open [Workers KV](https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces).
2. **Create instance**.
3. Name it something like `offload-test-results` → **Create**.
4. Open the namespace and copy **Namespace ID**.

Official steps: [Create a KV namespace](https://developers.cloudflare.com/kv/get-started/#2-create-a-kv-namespace).

**CLI**

```bash
npx wrangler login
npx wrangler kv namespace create offload-test-results
```

Wrangler prints an `id` like `a1b2c3d4e5f6...`. That string is `CLOUDFLARE_KV_NAMESPACE_ID`. Do not paste it into the committed `wrangler.toml`; GitHub Actions injects it at deploy time.

### 4. Add the secrets in GitHub

1. Open the GitHub repo.
2. **Settings** → **Secrets and variables** → **Actions**.
   Direct path: `https://github.com/<owner>/<repo>/settings/secrets/actions`
3. **New repository secret** for each name below (names must match exactly):

| Name | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account id from step 1 |
| `CLOUDFLARE_API_TOKEN` | Token from step 2 |
| `CLOUDFLARE_KV_NAMESPACE_ID` | Namespace id from step 3 |

GitHub docs: [Creating secrets for a repository](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository).

`GITHUB_TOKEN` is created by GitHub Actions automatically. Do not add it.

### 5. Deploy

Pushing commits to `main` does **not** deploy. Cloudflare is updated only when you **push a git tag** (or run the workflow by hand).

1. Push the repo to GitHub and confirm the three secrets exist.
2. Tag a commit and push the tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

You can also create a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository), which creates a tag.

3. **Actions → Deploy to Cloudflare Pages** runs tests, then `wrangler pages deploy`. It creates the Pages project `offload-testcases` if needed.

To deploy without a tag, open that workflow and choose **Run workflow**.

After a successful run, open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages), select **offload-testcases**, and use the `*.pages.dev` URL.

If you also connect the repo in the Cloudflare dashboard, turn off Cloudflare’s automatic git deploys so only GitHub Actions deploys. Two pipelines can fight over KV bindings.

The Action writes the KV id into `wrangler.toml` only during CI. The committed file does not contain credentials.

## Test catalog

The repo file `public/data/test-cases.json` is the Offload Media Cloud Storage Pro **v6.2.0** manual QA set (111 cases). Original IDs are unchanged (`TC-ENV-01`, `TC-DASH-01`, `TC-VER-01`, …).

Mark **Passed**, **Failed**, **Blocked**, or **Skipped / N/A**. Failed cases can record severity (Blocker / Critical / Major / Minor).

To add cases later, edit that JSON (or `scripts/build-catalog.mjs` and run `node scripts/build-catalog.mjs`). Keep existing `id` values stable so KV results still match. Restart Full Test clears KV results only.

## API

- `GET /api/results` — current KV results (empty document if KV has no key)
- `PUT /api/results` — `{ "revision": <last seen>, "results": { ... } }`

If `revision` does not match, the API returns **409** and the UI asks whether to reload or overwrite.
