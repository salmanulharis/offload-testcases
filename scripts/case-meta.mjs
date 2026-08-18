/** Checking purpose, release goals, and fail impact for the 6.2.0 catalog. IDs must stay stable. */

export const RELEASE_GOALS = [
  { id: "G1", title: "Single lifecycle truth", proves: "One lifecycle state per attachment across all surfaces", sections: "Dashboard, Media Library, CLI, CSV" },
  { id: "G2", title: "Verification detects cloud reality", proves: "Missing object after verify → Failed, not healthy offloaded", sections: "Verification, Dashboard Failed" },
  { id: "G3", title: "URLs follow lifecycle", proves: "No broken cloud URL for Failed when local exists; private uses signed URLs", sections: "Media Library, front-end, Woo" },
  { id: "G4", title: "Verification jobs are durable", proves: "Progress, pause/resume, survive navigation, no duplicate jobs", sections: "Bulk Operations" },
  { id: "G5", title: "Delete-local cannot bypass safety", proves: "Unverified offloaded files keep local copies when safety is ON", sections: "Delete from Server, CLI delete-local" },
  { id: "G6", title: "Dashboard + CSVs are operational truth", proves: "Cards and exports reflect lifecycle, not legacy counters alone", sections: "Dashboard reports, CSV" },
  { id: "G7", title: "File Manager bulk ops are scoped", proves: "Only selected keys, complete honestly, report partial failures", sections: "File Manager" },
  { id: "G8", title: "WP-CLI matches admin semantics", proves: "Same lifecycle counts and safety rules as the UI", sections: "WP-CLI" },
  { id: "Env", title: "Environment / operator experience", proves: "Safe staging, correct build, screens load, clear errors", sections: "Smoke, Troubleshoot, polish" },
];

export const SECTION_META = {
  environment: {
    purpose: "Confirm the environment is safe, the correct build is under test, and admin/CLI surfaces load before lifecycle or destructive tests.",
    goals: ["Env"],
  },
  dashboard: {
    purpose: "Dashboard is the operator’s summary of library health. Cards and exports must reflect lifecycle truth (G1, G6), not legacy sync meta alone, and must guide users toward verification when needed (G4).",
    goals: ["G1", "G4", "G6"],
  },
  verification: {
    purpose: "Start Verification must run a real durable job that updates lifecycle metadata, survives navigation, and reports failures honestly (G4). Critical regression: jobs stuck at 0% or duplicate jobs.",
    goals: ["G2", "G4"],
  },
  "media-library": {
    purpose: "Media Library is where editors see per-file lifecycle truth (G1). List, grid, details, and filters must agree. URL delivery for private media must not leak permanent public links (G3).",
    goals: ["G1", "G3"],
  },
  "delete-local": {
    purpose: "Require Verification Before Delete Local must prevent local deletion until cloud existence is confirmed (G5). This guards against permanent data loss when cloud copy is missing or stale.",
    goals: ["G5"],
  },
  "private-downloads": {
    purpose: "E-commerce download flows must deliver private offloaded files securely without leaking permanent bucket URLs (G3).",
    goals: ["G3"],
  },
  "wp-cli": {
    purpose: "CLI must mirror admin lifecycle semantics and safety rules — not a divergent code path (G8, G5).",
    goals: ["G8", "G5"],
  },
  "csv-reports": {
    purpose: "Exported reports must match on-screen lifecycle truth and be restricted to admins (G6).",
    goals: ["G6"],
  },
  regression: {
    purpose: "Upgrade and core offload flows must not regress — existing merchants keep credentials, uploads, CDN, and mutual job exclusion.",
    goals: ["Env", "G4"],
  },
  errors: {
    purpose: "Failures must be human-readable and actionable — not raw stack traces or silent retries forever.",
    goals: ["Env"],
  },
  "cache-busting": {
    purpose: "Cache busting must version delivery URLs without changing bucket object keys.",
    goals: ["G3"],
  },
  "static-assets": {
    purpose: "Theme/plugin static asset offload is optional and must not break site styling when toggled or on sync failure.",
    goals: ["Env"],
  },
  "file-manager": {
    purpose: "File Manager must browse safely, link to WP media correctly, and run scoped bulk ops that complete honestly (G7).",
    goals: ["G7"],
  },
  troubleshoot: {
    purpose: "Diagnostics help operators fix config without wiping settings or mappings.",
    goals: ["Env"],
  },
  providers: {
    purpose: "Core lifecycle + verification path works on each supported provider; ACL/private features marked N/A where provider lacks capability.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  polish: {
    purpose: "Navigation, stability, stress, and leaving staging in the intended production configuration.",
    goals: ["Env", "G4"],
  },
};

export const CASE_META = {
  "TC-ENV-01": {
    purpose: "Destructive tests (delete-local, remove-from-cloud, bucket delete) must not run on production without a restore path — prevents irreversible media loss.",
    goals: ["Env"],
  },
  "TC-ENV-02": {
    purpose: "QA results apply to the intended release; wrong version invalidates lifecycle/verification findings.",
    goals: ["Env"],
  },
  "TC-ENV-03": {
    purpose: "License gate must not block access to screens needed for P0 testing.",
    goals: ["Env"],
  },
  "TC-ENV-04": {
    purpose: "All cloud, verification, and File Manager tests require a live provider + bucket — without this, downstream cases are Blocked not Fail.",
    goals: ["Env"],
  },
  "TC-ENV-05": {
    purpose: "CLI exposes the same lifecycle count model as Dashboard (G1/G8) and does not fatal on a normal site.",
    goals: ["G8"],
  },
  "TC-ENV-06": {
    purpose: "Admin React bundle must not break WordPress globals — otherwise Dashboard, Bulk Ops, and Media Library JS fail silently or partially.",
    goals: ["Env"],
  },
  "SETUP-NEW-IMG": {
    purpose: "Named fixtures let every case refer to the same attachment IDs — required for cross-surface consistency checks (G1).",
    goals: ["G1"],
  },
  "SETUP-NEW-PDF": {
    purpose: "Named Offloaded PDF fixture for later lifecycle and delivery cases (G1).",
    goals: ["G1"],
  },
  "SETUP-NEW-LARGE": {
    purpose: "Named larger Offloaded file so pause/resume and progress cases do not finish instantly (G4).",
    goals: ["G1", "G4"],
  },
  "SETUP-LOCAL-ONLY": {
    purpose: "Named local-only file so sync → Offloaded transitions can be observed on a known ID (G1).",
    goals: ["G1"],
  },
  "SETUP-LEGACY": {
    purpose: "Identify a pre-6.2.0 offload so backward-compatible Offloaded counting can be checked (G1).",
    goals: ["G1"],
  },
  "SETUP-TO-FAIL": {
    purpose: "Create an offloaded WP attachment whose cloud object is missing — required for G2 Failed-after-verify.",
    goals: ["G2"],
  },
  "SETUP-TO-VERIFY": {
    purpose: "Identify an offloaded unverified file for awaiting-verification and delete-local safety cases (G5).",
    goals: ["G5"],
  },
  "SETUP-VERIFIED-1": {
    purpose: "Produce a Verified attachment so post-verify lifecycle and allowed delete-local cases have a known ID (G1).",
    goals: ["G1"],
  },
  "SETUP-LOCAL-GONE": {
    purpose: "Produce a Local Deleted attachment to test download/restore after safe delete-local (G5).",
    goals: ["G5"],
  },
  "SETUP-PRIVATE-DL": {
    purpose: "Produce a private offloaded downloadable file for Woo/EDD signed URL cases (G3).",
    goals: ["G3"],
  },
  "SETUP-WEBP": {
    purpose: "Optional WebP image fixture if conversion/offload of that format is in scope.",
    goals: ["Env"],
  },
  "TC-DASH-01": {
    purpose: "Primary admin entry point must load without JS errors so operators can see connection health and media summary.",
    goals: ["G6"],
    failImpact: "Operators cannot assess offload health or start verification from Dashboard.",
  },
  "TC-DASH-02": {
    purpose: "Each card must map to a distinct lifecycle bucket so totals are interpretable (offloaded ≠ verified ≠ failed).",
    goals: ["G1", "G6"],
    failImpact: "Misleading counts (e.g. 27/27 offloaded while items are Failed) drive wrong delete-local decisions.",
  },
  "TC-DASH-03": {
    purpose: "Operators must be warned when local delete is unsafe and routed to Start Verification — closes the gap between “offloaded” and “confirmed on cloud”.",
    goals: ["G4"],
    failImpact: "Users delete locals without knowing cloud was never verified.",
  },
  "TC-DASH-04": {
    purpose: "Empty/unconfigured state must be actionable — not a blank or broken Dashboard.",
    goals: ["G6"],
  },
  "TC-DASH-05": {
    purpose: "Operators with unsynced eligible media must be routed to bulk sync, not left without guidance.",
    goals: ["G6"],
  },
  "TC-DASH-06": {
    purpose: "Support/ops need an exportable list of failed lifecycle items with errors — must match Failed card semantics (G2, G6).",
    goals: ["G2", "G6"],
    failImpact: "Failed items invisible to support; manual DB hunting required.",
  },
  "TC-DASH-07": {
    purpose: "Verification audit export must include per-check dimensions (size_ok, safe_to_remove_local, etc.) for compliance and debugging.",
    goals: ["G6"],
  },
  "TC-VER-01": {
    purpose: "Clicking Start Verification must enqueue work with visible progress — not a no-op or fake success toast.",
    goals: ["G4"],
    failImpact: "Metadata never updates; operators think verification ran.",
  },
  "TC-VER-02": {
    purpose: "Verification must complete server-side — operators close the tab during long runs.",
    goals: ["G4"],
    failImpact: "Large libraries never finish verify on hosts without reliable loopback workers.",
  },
  "TC-VER-03": {
    purpose: "Long verify jobs must be operable — pause for maintenance, cancel mistaken runs without corrupting state.",
    goals: ["G4"],
  },
  "TC-VER-04": {
    purpose: "Successful verify must propagate lifecycle Verified to Media Library and Dashboard counts in sync (G1).",
    goals: ["G1"],
    failImpact: "Verified in job table but still “awaiting verification” in UI.",
  },
  "TC-VER-05": {
    purpose: "Core v6.2.0 regression. When cloud object is gone, verify must set Failed everywhere — not keep false “healthy offloaded” counts or broken cloud URLs (G2, G1, G3).",
    goals: ["G2", "G1", "G3"],
    failImpact: "Dashboard shows 27/27 offloaded; Media Library not bannered; site serves 404 cloud URL — exact pre-release bug.",
  },
  "TC-VER-06": {
    purpose: "Concurrent Remove + Verify must not corrupt metadata or race the same attachments.",
    goals: ["G4"],
  },
  "TC-VER-07": {
    purpose: "Accidental double-click must not spawn duplicate verify jobs processing the same library twice.",
    goals: ["G4"],
  },
  "TC-VER-08": {
    purpose: "Mutex in reverse direction — Remove cannot start during active Verify.",
    goals: ["G4"],
  },
  "TC-ML-01": {
    purpose: "List view must show lifecycle labels editors rely on for bulk decisions.",
    goals: ["G1"],
  },
  "TC-ML-02": {
    purpose: "Grid badge must match list lifecycle — editors use grid for visual scanning.",
    goals: ["G1"],
  },
  "TC-ML-03": {
    purpose: "Attachment details are the authoritative per-file view — must match list/grid for same ID (G1).",
    goals: ["G1"],
  },
  "TC-ML-04": {
    purpose: "New offload transitions lifecycle to Offloaded and front-end can load from cloud (G1, G3).",
    goals: ["G1", "G3"],
  },
  "TC-ML-05": {
    purpose: "Post-verify lifecycle label and filter must reflect Verified, not stuck on Offloaded.",
    goals: ["G1"],
  },
  "TC-ML-06": {
    purpose: "After safe local delete, lifecycle shows local removed while site still serves from cloud (G5, G1).",
    goals: ["G5", "G1"],
  },
  "TC-ML-07": {
    purpose: "Remove from cloud must reset lifecycle to not offloaded when object is gone from bucket.",
    goals: ["G1"],
  },
  "TC-ML-08": {
    purpose: "Filters must query lifecycle state correctly — wrong filter = editors miss Failed or delete wrong files.",
    goals: ["G1"],
  },
  "TC-ML-09": {
    purpose: "Grid AJAX filter must match list filter semantics — same lifecycle query, different view (G1).",
    goals: ["G1"],
  },
  "TC-ML-10": {
    purpose: "Pre-6.2.0 offloads without full lifecycle meta must still appear as Offloaded — backward compatibility (G1).",
    goals: ["G1"],
  },
  "TC-ML-11": {
    purpose: "Per-object ACL preference must persist and respect provider capability limits.",
    goals: ["G3"],
  },
  "TC-ML-12": {
    purpose: "Private objects must not be delivered via guessable permanent public URLs (G3).",
    goals: ["G3"],
    failImpact: "Private media leaked to anyone with bucket URL pattern.",
  },
  "TC-ML-13": {
    purpose: "Lifecycle UI must not break existing bulk sync/remove/delete/download actions.",
    goals: ["G1"],
  },
  "TC-DEL-01": {
    purpose: "Core safety gate — unverified offloaded file must not lose local copy while cloud may be wrong or missing.",
    goals: ["G5"],
    failImpact: "Permanent data loss if cloud object was never confirmed or was deleted externally.",
  },
  "TC-DEL-02": {
    purpose: "After verification confirms cloud copy, intentional local delete must succeed and site keeps serving from cloud.",
    goals: ["G5"],
  },
  "TC-DEL-03": {
    purpose: "Operators can recover local copies after delete-local — reversibility path.",
    goals: ["G5"],
  },
  "TC-DEL-04": {
    purpose: "Idempotent delete-local — no error storms or retry loops on already-removed locals.",
    goals: ["G5"],
  },
  "TC-DEL-05": {
    purpose: "Confirm setting OFF actually disables gate — merchants who opt out accept risk knowingly.",
    goals: ["G5"],
  },
  "TC-DEL-06": {
    purpose: "Re-enabling safety must restore protection immediately after TC-DEL-05.",
    goals: ["G5"],
  },
  "TC-DEL-07": {
    purpose: "Bulk delete-local job must apply same verification gate as per-file UI (G5).",
    goals: ["G5"],
  },
  "TC-WOO-01": {
    purpose: "Public product images offloaded to cloud must still render on storefront (G3).",
    goals: ["G3"],
  },
  "TC-WOO-02": {
    purpose: "Authorized buyer must receive file via signed/temporary delivery, not broken permanent URL.",
    goals: ["G3"],
  },
  "TC-WOO-03": {
    purpose: "Unauthorized users must not download private product files via raw bucket/CDN URL (G3).",
    goals: ["G3"],
  },
  "TC-EDD-01": {
    purpose: "EDD download path must work for private offloaded files same as Woo (G3).",
    goals: ["G3"],
  },
  "TC-EDD-02": {
    purpose: "EDD integration must be optional — no fatal when plugin absent.",
    goals: ["Env"],
  },
  "TC-CLI-01": {
    purpose: "CLI surface documents verify/delete-local/status — operators discover lifecycle commands.",
    goals: ["G8"],
  },
  "TC-CLI-02": {
    purpose: "status counts must align with Dashboard lifecycle buckets (G1, G8).",
    goals: ["G1", "G8"],
  },
  "TC-CLI-03": {
    purpose: "CLI offload still works and updates Media Library lifecycle to Offloaded.",
    goals: ["G8"],
  },
  "TC-CLI-04": {
    purpose: "Failed attachments must not be re-offload candidates when --skip-failed is used.",
    goals: ["G8"],
  },
  "TC-CLI-05": {
    purpose: "CLI verify must complete on small batch — same durability expectation as UI (G4, G8).",
    goals: ["G4", "G8"],
  },
  "TC-CLI-06": {
    purpose: "CLI delete-local must enforce verification safety same as UI (G5, G8).",
    goals: ["G5", "G8"],
    failImpact: "Mass local wipe via CLI bypassing safety setting.",
  },
  "TC-CLI-07": {
    purpose: "Verified files are eligible for CLI delete-local when safety ON.",
    goals: ["G5", "G8"],
  },
  "TC-CLI-08": {
    purpose: "CLI restore path recovers local files after delete-local.",
    goals: ["G8"],
  },
  "TC-CLI-09": {
    purpose: "CLI remove-from-cloud works on disposable batch without prompting (staging discipline required).",
    goals: ["G8"],
  },
  "TC-CLI-10": {
    purpose: "Async verify enqueues durable job visible in Bulk Operations — CLI and UI share job engine (G4, G8).",
    goals: ["G4", "G8"],
  },
  "TC-CLI-11": {
    purpose: "Automation/scripts must detect verify/offload failures via exit code, not silent success.",
    goals: ["G8"],
  },
  "TC-CSV-01": {
    purpose: "Dashboard and Bulk Ops exports must be the same data source — no drift between entry points.",
    goals: ["G6"],
  },
  "TC-CSV-02": {
    purpose: "Per-job failure export must match on-screen failure list for that run (G4, G6).",
    goals: ["G4", "G6"],
  },
  "TC-CSV-03": {
    purpose: "Media export REST endpoints must not leak customer media metadata to unprivileged users.",
    goals: ["G6"],
  },
  "TC-CSV-04": {
    purpose: "Export must scale to real merchant libraries without hanging admin.",
    goals: ["G6"],
  },
  "TC-CSV-05": {
    purpose: "Reports must reflect state after retry — fixed items leave Failed; remaining failures persist (G2, G6).",
    goals: ["G2", "G6"],
  },
  "TC-REG-01": {
    purpose: "6.2.0 upgrade must be non-disruptive for existing offloaded libraries.",
    goals: ["Env"],
  },
  "TC-REG-02": {
    purpose: "Provider onboarding path still works on this release.",
    goals: ["Env"],
  },
  "TC-REG-03": {
    purpose: "Automatic upload offload still works — primary happy path for new media.",
    goals: ["G3"],
  },
  "TC-REG-04": {
    purpose: "CDN rewrite must apply on front-end when configured.",
    goals: ["G3"],
  },
  "TC-REG-05": {
    purpose: "Keep local setting is independent of delete-local safety — upload behavior matches config.",
    goals: ["G5"],
  },
  "TC-REG-06": {
    purpose: "Older bulk UI still functional alongside Durable Job Engine.",
    goals: ["G4"],
  },
  "TC-REG-07": {
    purpose: "Third-party media fields still resolve cloud URLs correctly.",
    goals: ["G3"],
  },
  "TC-REG-08": {
    purpose: "Durable Sync and Durable Remove cannot run concurrently — prevents conflicting metadata writes.",
    goals: ["G4"],
  },
  "TC-ERR-01": {
    purpose: "Credential errors must guide fix, not expose internals.",
    goals: ["Env"],
  },
  "TC-ERR-02": {
    purpose: "IAM permission gaps must be identifiable from the message.",
    goals: ["Env"],
  },
  "TC-ERR-03": {
    purpose: "Configuration mistakes must surface clearly at connect time.",
    goals: ["Env"],
  },
  "TC-ERR-04": {
    purpose: "FM must help operators understand missing/mismatched objects (ties to G2).",
    goals: ["G2"],
  },
  "TC-ERR-05": {
    purpose: "Job engine must not infinite-retry permanent errors; temporary errors retry then fail clearly.",
    goals: ["G4"],
  },
  "TC-CACHE-01": {
    purpose: "Default OFF must not add query params to media URLs.",
    goals: ["G3"],
  },
  "TC-CACHE-02": {
    purpose: "When ON, version query busts CDN cache; object key in bucket unchanged.",
    goals: ["G3"],
  },
  "TC-SA-01": {
    purpose: "Feature off by default; enabling must not break site before sync completes.",
    goals: ["Env"],
  },
  "TC-SA-02": {
    purpose: "Static asset settings survive save/reload.",
    goals: ["Env"],
  },
  "TC-SA-03": {
    purpose: "Static asset sync runs as background job with progress and correct MIME delivery.",
    goals: ["G4"],
  },
  "TC-SA-04": {
    purpose: "Remove static assets from cloud without deleting local theme/plugin files.",
    goals: ["Env"],
  },
  "TC-SA-05": {
    purpose: "Static asset sync failure must not break front-end — fallback to local.",
    goals: ["Env"],
  },
  "TC-FM-01": {
    purpose: "Core navigation and provider limits visible before destructive tests.",
    goals: ["G7"],
  },
  "TC-FM-02": {
    purpose: "Single-file CRUD and metadata actions work without breaking linked media.",
    goals: ["G7"],
  },
  "TC-FM-03": {
    purpose: "Bulk select + bulk delete/copy/move/download affect only selected keys, report partial failures, show loading state (G7).",
    goals: ["G7"],
    failImpact: "Wrong objects deleted or bulk delete stuck while UI shows success — pre-release FM regression.",
  },
  "TC-FM-04": {
    purpose: "Cloud objects linked to attachments stay consistent after FM rename/move/import.",
    goals: ["G7"],
  },
  "TC-FM-05": {
    purpose: "FM REST API and path handling must reject traversal and unauthorized access.",
    goals: ["G7"],
  },
  "TC-TS-01": {
    purpose: "Baseline connection health visible on Troubleshoot screen.",
    goals: ["Env"],
  },
  "TC-TS-02": {
    purpose: "Broken credentials must fail check with a clear message.",
    goals: ["Env"],
  },
  "TC-TS-03": {
    purpose: "Media and URL diagnostics useful; export/import tools non-destructive.",
    goals: ["G1", "G3"],
  },
  "TC-PROV-S3": {
    purpose: "Core lifecycle + verification path works on Amazon S3, including private/ACL where supported.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  "TC-PROV-R2": {
    purpose: "Same thin path on Cloudflare R2; Cloud Access / object ACL is N/A and UI must say unsupported.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  "TC-PROV-GCS": {
    purpose: "Same thin path on Google Cloud; UBLA means no per-object ACL — Cloud Access N/A.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  "TC-PROV-SPACES": {
    purpose: "Same thin path on DigitalOcean Spaces; object ACL typically supported.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  "TC-PROV-WASABI": {
    purpose: "Same thin path on Wasabi; object ACL typically supported.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  "TC-PROV-MINIO": {
    purpose: "Same thin path on MinIO; object ACL typically supported.",
    goals: ["G1", "G2", "G3", "G4", "G7"],
  },
  "TC-POL-01": {
    purpose: "Admin navigation consistent; hash routes persist on refresh.",
    goals: ["Env"],
  },
  "TC-POL-02": {
    purpose: "Full pass must not produce PHP fatals or repeated admin error popups.",
    goals: ["Env"],
  },
  "TC-POL-03": {
    purpose: "Large verify/sync batches complete with pause/resume — production-scale libraries.",
    goals: ["G4"],
  },
  "TC-POL-04": {
    purpose: "Staging left in agreed production state (safety ON, optional features as intended).",
    goals: ["G5"],
  },
};
