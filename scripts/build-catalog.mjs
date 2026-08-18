import { writeFileSync } from "node:fs";

function caseFrom([id, title, priority, where, url, given, when, then]) {
  return {
    id,
    title,
    priority,
    where,
    url,
    given,
    when,
    then,
    description: [given && `Given: ${given}`, `When: ${when}`].filter(Boolean).join("\n"),
    expectedResult: then,
  };
}

const catalog = {
  version: 1,
  title: "Offload Media – Cloud Storage Pro v6.2.0",
  description:
    "Manual QA catalog (unit-test style). Mark Pass / Fail / Blocked / Skipped (use Skipped for N/A). If a Given precondition is missing, mark Blocked and say why. Fail severity: Blocker / Critical / Major / Minor. P0 first this release: Dashboard verification cards, Start Verification, Media Library statuses, delete-local safety, private downloads, WP-CLI, CSV reports. After opening Offload Media, use the plugin sidebar (not the WP left menu). Keep the browser console open (F12) and hard-refresh plugin admin pages with Ctrl+F5.",
  pluginVersion: "6.2.0",
  howToMark: ["passed", "failed", "skipped", "blocked"],
  pageMap: [
    { screen: "Plugin home / Dashboard", path: "WP Admin → Offload Media", url: "/wp-admin/admin.php?page=offload-media-settings#dashboard" },
    { screen: "Storage Provider", path: "Offload Media → sidebar Storage Provider", url: "/wp-admin/admin.php?page=offload-media-settings#storage-provider" },
    { screen: "General Settings", path: "Offload Media → sidebar General Settings", url: "/wp-admin/admin.php?page=offload-media-settings#general-settings" },
    { screen: "Bulk Operations", path: "Offload Media → sidebar Bulk Operations", url: "/wp-admin/admin.php?page=offload-media-settings#bulk-operations" },
    { screen: "File Manager", path: "Offload Media → sidebar File Manager", url: "/wp-admin/admin.php?page=offload-media-settings#file-manager" },
    { screen: "Optimisation", path: "Offload Media → sidebar Optimisation", url: "/wp-admin/admin.php?page=offload-media-settings#optimisation" },
    { screen: "Troubleshoot", path: "Offload Media → sidebar Troubleshoot", url: "/wp-admin/admin.php?page=offload-media-settings#troubleshoot" },
    { screen: "License", path: "Offload Media → sidebar License (under Support)", url: "/wp-admin/admin.php?page=offload-media-settings#license" },
    { screen: "Media Library list", path: "WP Admin → Media → Library → List", url: "/wp-admin/upload.php?mode=list" },
    { screen: "Media Library grid", path: "WP Admin → Media → Library → Grid", url: "/wp-admin/upload.php?mode=grid" },
  ],
  sections: [
    {
      id: "environment",
      title: "1. Smoke / environment",
      description: "Confirm staging/backup, plugin version, license, provider, and WP-CLI before P0 work.",
      subsections: [
        {
          id: "smoke",
          title: "Environment checks",
          testCases: [
            caseFrom(["TC-ENV-01", "Staging or backup exists", "P0", "Your host / WP admin (not inside the plugin)", "", "You are about to test delete-local / remove-from-cloud.", "Confirm this is staging or you have a DB + wp-content/uploads backup.", "You can restore if a test goes wrong. Do not run mass remove on production."]),
            caseFrom(["TC-ENV-02", "Plugin shows 6.2.0", "P0", "WP Admin → Plugins → Installed Plugins", "/wp-admin/plugins.php", "", "Find Offload Media - Cloud Storage Pro.", "Version is 6.2.0. Plugin is Active."]),
            caseFrom(["TC-ENV-03", "License lets you into Main screens", "P0", "Offload Media → License", "/wp-admin/admin.php?page=offload-media-settings#license", "", "Open Dashboard.", "You see Dashboard / Storage Provider / Bulk Operations. If you only see License, activate a valid license first (Blocked)."]),
            caseFrom(["TC-ENV-04", "Provider connected, test bucket selected", "P0", "Offload Media → Storage Provider", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "", "Confirm provider, credentials saved, connection verified, bucket selected.", "Header shows connected provider + bucket. Dashboard later says Connected to {provider}."]),
            caseFrom(["TC-ENV-05", "WP-CLI status (if CLI exists)", "P0", "SSH / local terminal in the WordPress root", "", "WP-CLI is available, or mark Skipped / N/A.", "Run `wp acoofmp status`.", "Prints Provider/bucket and counts (Total, Eligible, Offloaded, Verified, Awaiting Verification, Not Offloaded, Failed, Retrying, Local Removed). No PHP fatal."]),
            caseFrom(["TC-ENV-06", "No Identifier 'wp' has already been declared", "P0", "Any plugin admin page + Media Library, console open", "", "", "Hard-refresh (Ctrl+F5), click Dashboard, Bulk Operations, Media Library.", "Console has no error Identifier 'wp' has already been declared."]),
          ],
        },
        {
          id: "fixtures",
          title: "0b. Test data setup (do this once)",
          description: "Create named files and keep attachment IDs. Later cases refer to these aliases.",
          testCases: [
            caseFrom(["SETUP-NEW-IMG", "Create NEW-IMG", "P0", "Media → Add New", "/wp-admin/media-new.php", "Copy new files to bucket is ON.", "Upload a small JPG.", "Lifecycle is Offloaded (not yet Verified). Note the attachment ID."]),
            caseFrom(["SETUP-NEW-PDF", "Create NEW-PDF", "P0", "Media → Add New", "/wp-admin/media-new.php", "Copy new files to bucket is ON.", "Upload a PDF the same way.", "Lifecycle is Offloaded. Note the attachment ID."]),
            caseFrom(["SETUP-NEW-LARGE", "Create NEW-LARGE", "P0", "Media → Add New", "/wp-admin/media-new.php", "Copy new files to bucket is ON.", "Upload a larger file (~5–20 MB).", "Lifecycle is Offloaded. Note the attachment ID."]),
            caseFrom(["SETUP-LOCAL-ONLY", "Create LOCAL-ONLY", "P0", "Media → Add New", "/wp-admin/media-new.php", "Copy-to-bucket is OFF, or the file is never synced.", "Upload a file that stays local only.", "Lifecycle is Not offloaded. Note the attachment ID."]),
            caseFrom(["SETUP-LEGACY", "Identify LEGACY file", "P0", "Media → Library", "/wp-admin/upload.php?mode=list", "A file that was already offloaded before this 6.2.0 update.", "Find that file and note its ID.", "Lifecycle is Offloaded. Keep it for TC-ML-10."]),
            caseFrom(["SETUP-TO-FAIL", "Create TO-FAIL", "P0", "File Manager or bucket console", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "A file is offloaded in WordPress.", "Delete that object in File Manager / bucket console.", "WP still shows Offloaded until you verify — then it should become Failed."]),
            caseFrom(["SETUP-TO-VERIFY", "Identify TO-VERIFY", "P0", "Media → Library", "/wp-admin/upload.php?mode=list", "Any offloaded file you have not verified yet.", "Note the attachment ID.", "Lifecycle is Offloaded / Awaiting verification."]),
            caseFrom(["SETUP-VERIFIED-1", "Create VERIFIED-1", "P0", "Bulk Operations → Start Verification", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "An offloaded unverified file exists.", "Offload if needed, then run Start Verification and wait.", "Lifecycle is Verified. Note the attachment ID."]),
            caseFrom(["SETUP-LOCAL-GONE", "Create LOCAL-GONE", "P0", "Media details → Delete from Server", "", "File is Verified. Require Verification Before Delete Local is ON.", "Verify, then Delete from Server.", "Lifecycle is Local Deleted. Note the attachment ID."]),
            caseFrom(["SETUP-PRIVATE-DL", "Create PRIVATE-DL", "P0", "Media details → Cloud Access", "", "Woo/EDD downloadable file (ZIP/PDF) is offloaded, or mark later cases N/A.", "Set Cloud Access = Private.", "Lifecycle is Offloaded + Private. Note the attachment ID."]),
            caseFrom(["SETUP-WEBP", "Optional WEBP fixture", "P1", "Media → Add New", "/wp-admin/media-new.php", "Optional image you will convert/offload as WebP.", "Upload or convert an image as WebP if that path is in scope.", "Fixture exists, or mark Skipped / N/A."]),
          ],
        },
      ],
    },
    {
      id: "dashboard",
      title: "2. Dashboard — verification cards & reports",
      description: "P0. Plugin home: WP Admin → Offload Media → #dashboard.",
      subsections: [
        {
          id: "dashboard-cards",
          title: "Cards, banners, CSV exports",
          testCases: [
            caseFrom(["TC-DASH-01", "Dashboard loads", "P0", "WP Admin → Offload Media (opens Dashboard)", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "License valid, provider configured.", "Open the page with console open.", "Title Dashboard. No console errors. You see connection health plus media cards."]),
            caseFrom(["TC-DASH-02", "Media summary cards show the right labels", "P0", "Dashboard → section Media summary", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "", "Look at the eight cards.", "You see exactly: 1. Library media — In WordPress Media Library; 2. Eligible to offload; 3. Offloaded — % of eligible; 4. Not offloaded — Remaining eligible to sync; 5. Local removed — Removed from server; 6. Verified — Cloud existence confirmed; 7. Awaiting verification — Offloaded, not yet verified; 8. Failed — Lifecycle / verify errors (or N retrying). Numbers feel roughly right vs Media Library (small lag is OK)."]),
            caseFrom(["TC-DASH-03", "Awaiting-verification warning + Verify Offloads", "P0", "Dashboard (top attention banner)", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "Some files are Offloaded but not Verified (Awaiting verification > 0).", "Read the banner. Click Verify Offloads.", "Banner text is like: “N offloaded file(s) are awaiting cloud verification before local files can be safely removed.” Clicking Verify Offloads takes you to Bulk Operations (#bulk-operations), not a dead end. You can see Start Verification on that page."]),
            caseFrom(["TC-DASH-04", "Storage not configured", "P1", "Dashboard", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "You can temporarily disconnect / use a site without provider (or a staging clone). Skip if you cannot safely disconnect.", "Open Dashboard with storage not configured.", "Banner: “Cloud storage is not configured yet…” Button Connect Provider goes to Storage Provider."]),
            caseFrom(["TC-DASH-05", "Pending offload CTA", "P1", "Dashboard", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "Not offloaded > 0 and no job running.", "Look at the attention banner / Bulk Operations block.", "Message about files not yet offloaded. Button Open Bulk Operations (or similar) goes to #bulk-operations."]),
            caseFrom(["TC-DASH-06", "Export failed CSV from Dashboard", "P0", "Dashboard → Media reports", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "", "Click Export failed CSV.", "Browser downloads acoofmp-failed-media.csv. File opens in Excel/Sheets. Columns include: attachment_id, title, state, last_error, verified_at."]),
            caseFrom(["TC-DASH-07", "Export verification CSV from Dashboard", "P0", "Dashboard → Media reports", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "", "Click Export verification CSV.", "Downloads acoofmp-verification-report.csv. Columns include: attachment_id, title, state, verification_status, verified_at, size_ok, etag_ok, url_ok, reason, code, object_key, provider, http_status, safe_to_remove_local."]),
          ],
        },
      ],
    },
    {
      id: "verification",
      title: "3. Bulk Operations — Start Verification",
      description: "P0. Durable Job Engine at the top of Bulk Operations. Related automated script: tests/cloud-verification.php.",
      subsections: [
        {
          id: "durable-verify",
          title: "Durable Job Engine",
          testCases: [
            caseFrom(["TC-VER-01", "Start Verification creates a job", "P0", "Offload Media → Bulk Operations → card Durable Job Engine", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "At least one offloaded, unverified file. No Remove-from-cloud job running.", "Click Start Verification.", "Toast/notice: verification job started (or already running). A job row appears with Operation Verify offloads. Status moves waiting/pending → processing. Live line Verifying cloud objects can appear above the buttons. Progress shows like N / M verified (x%) — numbers move during the run, not only at the end."]),
            caseFrom(["TC-VER-02", "Verification survives leaving the page", "P0", "Bulk Operations → Durable Job Engine", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A verification job can be started.", "Start Verification, then close the tab or go to Posts. Wait ~30–60s. Reopen Bulk Operations.", "Job is still processing or completed. It did not die with the browser."]),
            caseFrom(["TC-VER-03", "Pause / Resume / Cancel on verification", "P0", "Job table → Actions column", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A verification job with enough files that it does not finish instantly (use a larger library or pause quickly).", "1. Click Pause → status paused, progress bar stops chewing new files (in-flight items may finish). 2. Click Resume → continues from remaining items. 3. On another run (or remaining items): click Cancel → remaining pending items cancelled; cancelled items are not verified afterward.", "Each control matches the status in the table. Cancelled files stay Offloaded (not Verified) unless they already succeeded."]),
            caseFrom(["TC-VER-04", "Success updates Media Library + Dashboard", "P0", "After a successful verify → Media → Library (list) and Dashboard", "/wp-admin/upload.php?mode=list", "A file was verified (VERIFIED-1).", "Open a file that was verified. Refresh Dashboard.", "Lifecycle = Verified. Dashboard Verified count went up. Awaiting verification went down. If awaiting is now 0, the Dashboard warning improves or clears."]),
            caseFrom(["TC-VER-05", "Real verification failure is visible", "P0", "File Manager or bucket console, then Bulk Operations → Start Verification", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "File TO-FAIL is offloaded in WP, but you deleted the cloud object (or replaced it with a different-size file).", "Run Start Verification. When done, open Media Library details for that file. Optionally View failures on the job.", "Lifecycle = Failed. You can see a plain-language reason (missing object, size mismatch, URL check, etc.). Dashboard Failed > 0. Verification CSV reason / code matches that file. Site still loads other media; one failed verify does not take the site down."]),
            caseFrom(["TC-VER-06", "Verify is blocked while Remove is running", "P1", "Bulk Operations → Durable Job Engine", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A Start Durable Remove job is processing or paused.", "Look at Start Verification.", "Button is disabled / reads Blocked by Remove job. Tooltip explains wait. No second conflicting job is created."]),
            caseFrom(["TC-VER-07", "Double-click does not start two verify jobs", "P1", "Start Verification", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "", "Click the button twice quickly.", "One job only. Second click says verification is already running (or already active but paused — resume from the job list)."]),
            caseFrom(["TC-VER-08", "Remove is blocked while Verify is running", "P1", "Durable Job Engine", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "Verification job active.", "Look at Start Durable Remove.", "Disabled / Blocked by Verify job. Confirm dialog for remove is not the path to a second job."]),
          ],
        },
      ],
    },
    {
      id: "media-library",
      title: "9. Media Library — status, filters, public/private",
      description: "P0. List: /wp-admin/upload.php?mode=list. Grid: ?mode=grid. List column Offload Status; grid badge Offloaded; details field Lifecycle.",
      subsections: [
        {
          id: "library-status",
          title: "Status, filters, access",
          testCases: [
            caseFrom(["TC-ML-01", "List view Offload Status column", "P0", "WP Admin → Media → Library → click List (top-right of Media)", "/wp-admin/upload.php?mode=list", "", "Scan the Offload Status column.", "You see lifecycle labels, including: Not offloaded, Offloaded, Verified, Failed, Local deleted (as applicable). No PHP notices on the page."]),
            caseFrom(["TC-ML-02", "Grid view badge", "P0", "Media → Library → Grid", "/wp-admin/upload.php?mode=grid", "Files in Offloaded / Verified / Local Deleted.", "Hover the small badge on the thumbnail.", "Badge short text is Offloaded. Tooltip shows the specific state (Offloaded / Verified / Local Deleted). Badge does not appear on purely local (not offloaded) files."]),
            caseFrom(["TC-ML-03", "Details show the same lifecycle", "P0", "List: click file title. Grid: click thumbnail.", "", "", "Find field Lifecycle.", "Same state as the list/grid (Not offloaded / Offloaded / Verified / Failed / Local deleted). Offload Status legacy line still makes sense (Offloaded to Cloud / Stored on Server / Deleted from Server)."]),
            caseFrom(["TC-ML-04", "After sync → Offloaded", "P0", "Media details of LOCAL-ONLY or Bulk Operations Start Durable Sync", "", "LOCAL-ONLY exists or a file can be synced.", "Sync that file to cloud. Refresh Media Library.", "Lifecycle = Offloaded. Offload Actions show Remove from Cloud and Delete from Server. File loads on the front of the site from cloud/CDN."]),
            caseFrom(["TC-ML-05", "After verify → Verified", "P0", "Media details of VERIFIED-1", "", "After TC-VER-04.", "Confirm after TC-VER-04.", "Lifecycle = Verified. Filter Verified includes this file."]),
            caseFrom(["TC-ML-06", "After delete local → Local Deleted", "P0", "Media details of a Verified file → Delete from Server", "", "Safety setting ON (see TC-DEL-*).", "Click Delete from Server. Confirm. Refresh.", "Lifecycle = Local deleted (or Local Deleted). Offload Status also says Deleted from Server. Front of site still shows the image from the cloud. Local file is gone from wp-content/uploads."]),
            caseFrom(["TC-ML-07", "After remove from cloud → Not offloaded", "P0", "Media details → Remove from Cloud (use a disposable test file; download local first if local was deleted)", "", "A disposable offloaded test file exists.", "Remove from cloud. Refresh.", "Lifecycle = Not offloaded. Filter Not Offloaded includes it. Front of site uses local file if present."]),
            caseFrom(["TC-ML-08", "List filter dropdown", "P0", "Media → Library → List → dropdown All cloud statuses (next to other date/type filters)", "/wp-admin/upload.php?mode=list", "", "Choose each value and click Filter. Spot-check 3 files per view.", "All cloud statuses = mixed. Offloaded = Offloaded (typically not not-offloaded). Not Offloaded = Not offloaded. Failed = Failed. Verified = Verified. Local Deleted = Local deleted. Wrong files in a filter = Fail."]),
            caseFrom(["TC-ML-09", "Grid filter without a full WP page reload only", "P0", "Media → Library → Grid → dropdown #acoofmp-media-filter-grid", "/wp-admin/upload.php?mode=grid", "", "Change filter. Watch the grid refresh via AJAX.", "Grid updates to the right set. You should not need to fully reload upload.php for the filter to apply. Spot-check matches list-view filter."]),
            caseFrom(["TC-ML-10", "Legacy offloaded files still count as Offloaded", "P0", "Media Library filter Offloaded", "/wp-admin/upload.php?mode=list", "File LEGACY offloaded before 6.2.0.", "Find LEGACY.", "It appears under Offloaded (not missing / not Not offloaded). Front-end URL still works."]),
            caseFrom(["TC-ML-11", "Cloud Access Public / Private saves", "P0", "Attachment details → Cloud Access", "", "File is offloaded. Provider supports object-level ACL (S3 / Spaces / Wasabi / MinIO typically yes; R2 no; GCS with UBLA no — mark N/A and confirm UI says unsupported).", "1. Set Private. Update/Save. Close details. Reopen. 2. Set Public. Save. Reopen.", "The dropdown keeps the last saved value. Help text: “Private media is delivered with short-lived signed URLs.”"]),
            caseFrom(["TC-ML-12", "Private media on the front uses a temporary link", "P0", "Front of the site (a page/post that uses the private image) or attachment URL", "", "Cloud Access = Private. Presigned/signed delivery available.", "View the page logged-out. Inspect the image/file URL.", "It is not a long-lived public CDN/bucket URL that anyone can guess forever. It is a signed/temporary URL (or WP-mediated). File still displays for legitimate page views. Direct bucket URL without signature should not stay open."]),
            caseFrom(["TC-ML-13", "Media Library bulk actions still work", "P1", "List: checkbox + Bulk actions dropdown. Grid: select files + bulk cloud actions.", "/wp-admin/upload.php?mode=list", "", "On 1–3 test files, run Sync to Cloud (list) / Offload to Cloud (grid), then later Remove from Cloud on a disposable file.", "Action completes, status updates, no fatal error. List labels: Sync to Cloud, Remove from Cloud, Delete from Server, Download to Server."]),
          ],
        },
      ],
    },
    {
      id: "delete-local",
      title: "10. Delete from Server — verification safety",
      description: "Setting: Offload Media → General Settings → Jobs & Performance → Require Verification Before Delete Local. Leave ON for TC-DEL-01 through TC-DEL-04. Related: tests/storage-saver-flow.php, tests/storage-saver-eligibility.php.",
      subsections: [
        {
          id: "delete-safety",
          title: "Require Verification Before Delete Local",
          testCases: [
            caseFrom(["TC-DEL-01", "Unverified offloaded file cannot delete local", "P0", "Media details of TO-VERIFY (Offloaded, not Verified) → Delete from Server. Also test Media list bulk Delete from Server on the same kind of file.", "", "Safety ON. File is in the cloud but Lifecycle is Offloaded (not Verified).", "Attempt Delete from Server.", "Delete is blocked or skipped. Local file still exists on disk. Message is understandable (needs verification / cloud copy not confirmed). Dashboard Local removed does not jump up for this file."]),
            caseFrom(["TC-DEL-02", "After verify, Delete from Server works", "P0", "Verify the same file (Start Verification or wait for TC-VER-04) → Delete from Server", "", "Lifecycle = Verified. Safety ON.", "Delete from Server.", "Success. Local file gone. Front still shows media from cloud. Lifecycle = Local deleted."]),
            caseFrom(["TC-DEL-03", "Download to Server restores local file", "P0", "Details of LOCAL-GONE → Download to Server", "", "LOCAL-GONE exists (local already deleted).", "Click Download to Server. Check wp-content/uploads (or hosting file manager).", "Local file is back. Lifecycle returns to Verified (or Offloaded if verify meta is not verified). Site still works."]),
            caseFrom(["TC-DEL-04", "Already-deleted local does not error-loop", "P1", "Details of a Local Deleted file → Delete from Server again", "", "File is already Local Deleted.", "Try delete local a second time.", "Treated as already removed / skipped. No fatal, no endless retry spinner."]),
            caseFrom(["TC-DEL-05", "Safety OFF allows delete without verify (brief)", "P1", "General Settings → Jobs & Performance → turn Require Verification Before Delete Local OFF → Save", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "A disposable Offloaded-but-not-Verified file exists. Risky — staging only.", "On a disposable Offloaded-but-not-Verified file, Delete from Server.", "Local delete is allowed. Immediately turn the setting back ON and Save. Note the risk in the log."]),
            caseFrom(["TC-DEL-06", "Safety ON again", "P0", "Same setting → ON → Save", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "After TC-DEL-05.", "Repeat TC-DEL-01 on another unverified file.", "Protection has returned (blocked/skipped)."]),
            caseFrom(["TC-DEL-07", "Durable Remove local files job respects safety", "P1", "Bulk Operations older Delete from Server / Storage Saver card or job Remove local files", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "Mix of verified and unverified offloaded files. Safety ON.", "Run remove-local on the library (prefer a small staging set).", "Unverified files are skipped/failed with a clear reason. Verified files can be deleted locally. No mass wipe of unverified media."]),
          ],
        },
      ],
    },
    {
      id: "private-downloads",
      title: "11. Private downloads (Woo / EDD)",
      description: "Skip a subsection if the plugin is not installed. Mark Skipped / N/A.",
      subsections: [
        {
          id: "woocommerce",
          title: "WooCommerce",
          testCases: [
            caseFrom(["TC-WOO-01", "Product images still load from cloud", "P1", "Front: a product page. Admin: Products → Edit", "", "WooCommerce is installed. Product image is offloaded. Mark Skipped if Woo is out of scope.", "View product logged-out.", "Image loads (cloud/CDN). No broken image."]),
            caseFrom(["TC-WOO-02", "Buyer can download a private offloaded file", "P0", "Media → Library → set PRIVATE-DL Cloud Access = Private; Products → Edit → Downloadable product; My Account → Downloads", "", "Woo downloadable products are in scope. PRIVATE-DL exists. Mark Skipped if Woo downloads are out of scope.", "1. Set PRIVATE-DL Cloud Access = Private. 2. Point a downloadable product file URL at that media. 3. Place a test order as a customer (or use an existing completed order). 4. Customer who bought the product clicks Download.", "File downloads. Redirect may go to a short-lived signed cloud URL. No PHP error."]),
            caseFrom(["TC-WOO-03", "Stranger cannot use a permanent public cloud link", "P0", "Incognito / logged-out browser", "", "Woo private downloads in scope. PRIVATE-DL is private.", "Try the raw bucket/CDN URL of PRIVATE-DL without a fresh signature (copy from File Manager permanent-style URL if shown, or strip query signature).", "Access denied / 403 / does not download the product. Product page HTML does not leak a long-lived public object URL for that private file."]),
          ],
        },
        {
          id: "edd",
          title: "Easy Digital Downloads",
          testCases: [
            caseFrom(["TC-EDD-01", "Authorized EDD download works", "P0", "EDD Downloads product using PRIVATE-DL; complete a test purchase; use the EDD download link.", "", "EDD is in scope. Mark Skipped if EDD is not installed.", "Authorized customer downloads.", "File is delivered (signed redirect if EDD method is redirect)."]),
            caseFrom(["TC-EDD-02", "Site loads when EDD is not installed", "P1", "A site without Easy Digital Downloads", "", "This site does not have EDD, or use a clone without EDD.", "Browse wp-admin and the front.", "No fatal “class EDD not found”. Plugin screens still open."]),
          ],
        },
      ],
    },
    {
      id: "wp-cli",
      title: "12. WP-CLI",
      description: "WordPress root in terminal (staging). Prefer --limit. Do not run `wp acoofmp remove` without a tiny limit.",
      subsections: [
        {
          id: "cli-commands",
          title: "acoofmp commands",
          testCases: [
            caseFrom(["TC-CLI-01", "Help lists commands", "P0", "WordPress root in terminal", "", "WP-CLI exists, or mark Skipped.", "wp help acoofmp", "Lists: offload, restore, delete-local, remove, verify, status."]),
            caseFrom(["TC-CLI-02", "status matches Dashboard", "P0", "Terminal + Dashboard", "/wp-admin/admin.php?page=offload-media-settings#dashboard", "WP-CLI exists.", "wp acoofmp status then open Dashboard.", "Same kind of totals (Offloaded, Verified, Awaiting Verification, Failed, Local Removed). Exact match may lag by a cache refresh — refresh Dashboard if needed."]),
            caseFrom(["TC-CLI-03", "offload small batch", "P0", "WordPress root in terminal", "", "WP-CLI exists. Staging.", "wp acoofmp offload --limit=10", "Finishes cleanly. Done. success=… failed=… skipped=… then success. Those files show Offloaded in Media Library."]),
            caseFrom(["TC-CLI-04", "skip-failed", "P1", "WordPress root in terminal", "", "At least one Failed attachment.", "wp acoofmp offload --limit=10 --skip-failed", "Failed items are not picked as candidates. Command still finishes."]),
            caseFrom(["TC-CLI-05", "verify does not hang", "P0", "WordPress root in terminal", "", "WP-CLI exists.", "wp acoofmp verify --limit=10", "Completes (does not hang forever). Success/fail counts printed."]),
            caseFrom(["TC-CLI-06", "delete-local skips unverified when safety ON", "P0", "WordPress root in terminal", "", "Safety ON. Mix of verified + unverified.", "wp acoofmp delete-local --limit=10", "Logs Candidates (safe): N | Skipped (not verified): M. If none verified: warning No verified attachments eligible for local delete. Unverified local files still on disk."]),
            caseFrom(["TC-CLI-07", "delete-local after verify", "P0", "WordPress root in terminal", "", "Some verified files with local copies.", "wp acoofmp delete-local --limit=10", "Only verified (safe) files lose local copies. Media shows Local Deleted for those."]),
            caseFrom(["TC-CLI-08", "restore", "P0", "WordPress root in terminal", "", "Attachments whose local copies were removed.", "wp acoofmp restore --limit=5", "Local files come back for those attachments. No crash."]),
            caseFrom(["TC-CLI-09", "remove (tiny, intentional)", "P0", "WordPress root in terminal", "", "Disposable offloaded files only, local copies present. Staging.", "wp acoofmp remove --limit=5. There is no extra --yes prompt in CLI — your confirmation is the limit + staging.", "Those 5 (or fewer candidates) are removed from cloud. Media shows Not offloaded."]),
            caseFrom(["TC-CLI-10", "verify --async", "P0", "Terminal + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "WP-CLI exists.", "wp acoofmp verify --limit=5 --async", "Returns immediately (verify enqueued / Job UUID). Bulk Operations shows a Verify offloads job."]),
            caseFrom(["TC-CLI-11", "failures exit non-zero", "P1", "WordPress root in terminal", "", "You can cause a fail (e.g. verify after deleting a cloud object).", "Run the command that processes that item.", "Output includes failed count. Process exits with error (not a silent success)."]),
          ],
        },
      ],
    },
    {
      id: "csv-reports",
      title: "13. CSV reports (admin only)",
      description: "P0. Same exports from Dashboard and Bulk Operations.",
      subsections: [
        {
          id: "csv-exports",
          title: "Exports and access",
          testCases: [
            caseFrom(["TC-CSV-01", "Same CSVs from Bulk Operations", "P0", "Bulk Operations → Durable Job Engine → Export Failed CSV / Export Verification CSV", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "", "Click each.", "Same filenames as Dashboard. Open cleanly. Spot-check 2 known IDs vs Media Library."]),
            caseFrom(["TC-CSV-02", "Job failure CSV", "P0", "Job table → a job with Failed > 0 → View failures → Export CSV", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A job with Failed > 0.", "Export.", "CSV lists failed items for that job. IDs/reasons match the on-screen failure list."]),
            caseFrom(["TC-CSV-03", "Non-admin cannot download", "P0", "Incognito, or a user with role Editor / Subscriber (no manage_options)", "/wp-json/acoofmp-api/v1/media/export/failed", "", "While logged out or as non-admin, open /wp-json/acoofmp-api/v1/media/export/failed and /wp-json/acoofmp-api/v1/media/export/verification.", "401/403 (not a CSV of customer data). Admin session can download."]),
            caseFrom(["TC-CSV-04", "Large library still exports", "P1", "Dashboard or Bulk Operations CSV export", "", "A bigger library (hundreds+).", "Export verification CSV.", "Download completes. WP admin is not frozen forever. File is readable."]),
            caseFrom(["TC-CSV-05", "Retry failed then re-export", "P1", "Job with failures → Retry failed", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A job with failures.", "After retry, export failed CSV / verification CSV again.", "Fixed items leave Failed (or show verified). Remaining failures still listed."]),
          ],
        },
      ],
    },
    {
      id: "regression",
      title: "P1 — Basic regression",
      description: "Run after P0. Confirm update did not break existing surfaces.",
      subsections: [
        {
          id: "basic-regression",
          title: "Core plugin surfaces",
          testCases: [
            caseFrom(["TC-REG-01", "Update does not force reconnect / re-upload", "P1", "After activating/updating 6.2.0 → Storage Provider + Media Library", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "Site already had credentials and offloads before 6.2.0.", "Open Storage Provider and Media Library.", "Existing credentials and offloads remain. You are not forced to re-upload the library."]),
            caseFrom(["TC-REG-02", "Save credentials, verify, pick bucket", "P1", "Storage Provider", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "You can save provider settings on staging.", "Save, verify connection, select bucket.", "Save, verify connection, select bucket all work."]),
            caseFrom(["TC-REG-03", "Copy new files ON uploads to cloud", "P1", "General Settings → Media & Rewriting → Copy new files to bucket ON → Media → Add New", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "Copy new files to bucket is ON.", "Upload a new file via Media → Add New.", "New file goes to cloud. Front loads. Thumbnails / srcset load."]),
            caseFrom(["TC-REG-04", "CDN URLs", "P1", "General Settings → CDN & Delivery (if CDN on)", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "CDN is On, or mark Skipped.", "View front-end media.", "Front-end media URLs use the CDN host and load."]),
            caseFrom(["TC-REG-05", "Keep local copies matches setting", "P1", "General Settings → Media & Rewriting", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "", "Confirm keep-local setting vs files on disk (separate from Delete from Server).", "Files stay or leave locally as configured."]),
            caseFrom(["TC-REG-06", "Legacy Bulk Operation cards", "P1", "Bulk Operations → older cards (below Durable Job Engine)", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "", "Run Sync to Cloud, Remove from Cloud, Delete from Server, Download to Server. Check Pause on the older progress UI.", "Those cards still run. Pause still works on the older progress UI."]),
            caseFrom(["TC-REG-07", "ACF image field", "P1", "A post/field with an ACF image (if ACF exists)", "", "ACF exists, or mark Skipped.", "View the ACF image on front/admin.", "Correct image, cloud URL OK."]),
            caseFrom(["TC-REG-08", "Offload vs Remove mutual exclusion", "P1", "Durable Job Engine", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "", "Start Durable Sync, then try Start Durable Remove (and the reverse).", "Second button Blocked by Offload/Remove job. Message like “This process is already running.” HTTP conflict, no second job."]),
          ],
        },
      ],
    },
    {
      id: "errors",
      title: "4. Error messages",
      description: "Clear messages, not stack dumps.",
      subsections: [
        {
          id: "error-messages",
          title: "Provider and job errors",
          testCases: [
            caseFrom(["TC-ERR-01", "Wrong access key", "P1", "Storage Provider → save bad key/secret → verify", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "You can temporarily save bad credentials on staging.", "Save a bad key/secret and verify.", "Clear credentials-style message, not a raw stack dump. Restore good credentials after."]),
            caseFrom(["TC-ERR-02", "Missing upload permission", "P1", "Storage Provider", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "Credentials that can list but not PutObject (if you can simulate).", "Try an upload or connection verify.", "Can’t-upload / permission guidance."]),
            caseFrom(["TC-ERR-03", "Wrong bucket or region", "P1", "Storage Provider", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "You can set a wrong bucket or region on staging.", "Save wrong bucket/region and verify.", "Clear configuration message."]),
            caseFrom(["TC-ERR-04", "File Manager diagnose", "P1", "File Manager → missing mapped object → Diagnose", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "A mapped object is missing.", "Click Diagnose.", "Explains what’s wrong and what to try next."]),
            caseFrom(["TC-ERR-05", "Permanent vs temporary failures", "P1", "Durable job with a permission error vs a brief network blip", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "You can observe a permission error and a brief network blip.", "Watch retry behavior.", "Permanent permission problems do not retry forever. Temporary errors retry, then fail clearly."]),
          ],
        },
      ],
    },
    {
      id: "cache-busting",
      title: "5. Cache busting",
      description: "General Settings → CDN & Delivery → Cache Busting.",
      subsections: [
        {
          id: "cdn-cache",
          title: "CDN & Delivery",
          testCases: [
            caseFrom(["TC-CACHE-01", "OFF: no acoofmp_v", "P1", "General Settings → CDN & Delivery → Cache Busting", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "Cache Busting is OFF.", "View front-end media URLs.", "Front URLs have no acoofmp_v=."]),
            caseFrom(["TC-CACHE-02", "ON after re-offload", "P1", "General Settings → CDN & Delivery → Cache Busting", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "", "Turn ON, save, update/re-offload a file, view front.", "URL has version query. Bucket object key/path unchanged. Image loads. Srcset URLs also get the version. Turn OFF → new pages stop adding it."]),
          ],
        },
      ],
    },
    {
      id: "static-assets",
      title: "6. Static assets",
      description: "Settings: General Settings → Files & Assets. Actions: Bulk Operations → Static Assets.",
      subsections: [
        {
          id: "static-asset-jobs",
          title: "Theme & plugin CSS/JS/fonts",
          testCases: [
            caseFrom(["TC-SA-01", "OFF by default; local CSS/JS", "P1", "General Settings → Files & Assets", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "", "Confirm default and front-end assets before sync.", "Theme/plugin CSS/JS stay on WordPress. Turning the feature ON does not break the site before sync."]),
            caseFrom(["TC-SA-02", "Settings persist", "P1", "General Settings → Files & Assets", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "", "Enable Static Asset Offloading; tick CSS/JS/fonts/theme/plugin; include/exclude rules; save.", "Values stick after reload. UI mentions Bulk Operations to sync/remove."]),
            caseFrom(["TC-SA-03", "Sync job", "P1", "Bulk Operations → Static Assets", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "Static asset offloading is configured.", "Sync Static Assets.", "Background job, progress moves, Pause/Resume/Stop work, no duplicate Sync/Remove while active. After sync, eligible CSS/JS can load from cloud/CDN. CSS still styles the site (not downloaded as a wrong MIME). Fonts/icons still load. Refresh Status updates counts."]),
            caseFrom(["TC-SA-04", "Remove", "P1", "Bulk Operations → Static Assets", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "Static assets were synced.", "Remove from Cloud (confirm).", "Cloud copies removed. Local theme/plugin files still on disk. Site falls back to local URLs. Counts toward zero."]),
            caseFrom(["TC-SA-05", "Sync failure keeps local URLs", "P1", "Bulk Operations → Static Assets", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A sync can fail (or inspect a failed job).", "Observe a failed static-asset sync.", "Site does not break. Failure visible in job failures."]),
          ],
        },
      ],
    },
    {
      id: "file-manager",
      title: "7. File Manager",
      description: "Offload Media → File Manager (#file-manager).",
      subsections: [
        {
          id: "file-manager-ui",
          title: "Browse, actions, safety",
          testCases: [
            caseFrom(["TC-FM-01", "Browse", "P1", "Offload Media → File Manager", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "", "Open File Manager and use navigation controls.", "Page loads; breadcrumbs like Media Storage / uploads / …; Back / Forward / Refresh; Grid and List; sort + type filters; search in current folder; controls aligned. Provider limits (e.g. R2) shown honestly."]),
            caseFrom(["TC-FM-02", "Single-item actions", "P1", "File Manager", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "", "Open folders; upload button + drag-drop; create folder; click row opens details (checkbox does not); ⋮ menu; Rename/Move; Copy/Duplicate; Delete confirms; Download; Share/temp link when supported.", "Those actions work. Metadata/versions supported or clearly unsupported."]),
            caseFrom(["TC-FM-03", "Multi-select", "P1", "File Manager", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "", "Checkbox selects without opening details; Shift-click range; select page / clear; bulk delete confirms (durable job when large); bulk copy/move; ZIP/multi download if used.", "Multi-select and bulk actions behave as described."]),
            caseFrom(["TC-FM-04", "WP media link", "P1", "File Manager", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "", "Inspect a linked WP media object. Import a cloud-only file. Rename/move a linked file.", "Linked objects show attachment info. Random cloud-only files are not auto-added. Import to Media Library works for a cloud-only file. After rename/move of a linked file, the media item still resolves on the site."]),
            caseFrom(["TC-FM-05", "Safety", "P1", "File Manager + REST", "/wp-json/acoofmp-api/v1/files/", "", "Try path traversal. Call /wp-json/acoofmp-api/v1/files/* as non-admin. Watch Network for secrets.", "Paths like ../ rejected. Non-admin cannot call /wp-json/acoofmp-api/v1/files/* (401/403). Secrets never appear in Network responses. Diagnose panel is understandable."]),
          ],
        },
      ],
    },
    {
      id: "troubleshoot",
      title: "8. Troubleshoot",
      description: "Offload Media → Troubleshoot (#troubleshoot).",
      subsections: [
        {
          id: "health-checks",
          title: "Health, credentials, diagnostics",
          testCases: [
            caseFrom(["TC-TS-01", "Health check", "P1", "Offload Media → Troubleshoot", "/wp-admin/admin.php?page=offload-media-settings#troubleshoot", "Provider config is good.", "Open Troubleshoot and run the connection check.", "Page loads. Connection check passes when config is good."]),
            caseFrom(["TC-TS-02", "Bad credentials fail clearly", "P1", "Troubleshoot", "/wp-admin/admin.php?page=offload-media-settings#troubleshoot", "You can break credentials on purpose on staging.", "Break credentials on purpose, run check. Restore credentials after.", "Check fails clearly."]),
            caseFrom(["TC-TS-03", "Media / URL checks", "P1", "Troubleshoot", "/wp-admin/admin.php?page=offload-media-settings#troubleshoot", "", "Run media/URL checks. Export diagnostics. Use import/clear tools if present.", "Missing/mismatched media and URL/delivery checks are useful. Export diagnostics downloads a report. Import/clear tools still usable. Running checks does not wipe settings or mappings."]),
          ],
        },
      ],
    },
    {
      id: "providers",
      title: "14. Provider spot-check",
      description: "For each provider you care about this release, repeat: Connect → File Manager browse → upload → download → copy → delete → front-end media loads → Durable Sync sample → Start Verification sample → private access (or N/A) → delete-local safety once. R2: no object ACL — Cloud Access N/A. GCS UBLA: no per-object ACL.",
      subsections: [
        {
          id: "provider-matrix",
          title: "Thin path per provider",
          testCases: [
            caseFrom(["TC-PROV-S3", "Amazon S3 thin path", "P1", "Storage Provider + File Manager + Media + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "Amazon S3 is in scope for this pass, or mark Skipped.", "Connect → File Manager browse → upload → download → copy → delete → front-end media loads → Durable Sync sample → Start Verification sample → private access → delete-local safety once.", "All steps Pass (or Fail with notes). Private/Cloud Access is typically supported."]),
            caseFrom(["TC-PROV-R2", "Cloudflare R2 thin path", "P1", "Storage Provider + File Manager + Media + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "Cloudflare R2 is in scope, or mark Skipped.", "Same thin path as S3.", "All steps Pass except Cloud Access / object ACL: N/A — confirm UI says unsupported."]),
            caseFrom(["TC-PROV-GCS", "Google Cloud thin path", "P1", "Storage Provider + File Manager + Media + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "Google Cloud is in scope, or mark Skipped.", "Same thin path as S3.", "Pass / Fail. If UBLA: no per-object ACL — Cloud Access N/A."]),
            caseFrom(["TC-PROV-SPACES", "DigitalOcean Spaces thin path", "P1", "Storage Provider + File Manager + Media + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "DigitalOcean Spaces is in scope, or mark Skipped.", "Same thin path as S3.", "Pass / Fail. Object ACL typically supported."]),
            caseFrom(["TC-PROV-WASABI", "Wasabi thin path", "P1", "Storage Provider + File Manager + Media + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "Wasabi is in scope, or mark Skipped.", "Same thin path as S3.", "Pass / Fail. Object ACL typically supported."]),
            caseFrom(["TC-PROV-MINIO", "MinIO thin path", "P1", "Storage Provider + File Manager + Media + Bulk Operations", "/wp-admin/admin.php?page=offload-media-settings#storage-provider", "MinIO is in scope, or mark Skipped.", "Same thin path as S3.", "Pass / Fail. Object ACL typically supported."]),
          ],
        },
      ],
    },
    {
      id: "polish",
      title: "15. Final polish",
      description: "Sign-off surface. P0 cases (Dashboard verify, Start Verification, Media Library, delete-local safety, private downloads, CLI, CSV) should already be done.",
      subsections: [
        {
          id: "final-polish",
          title: "Sidebar, logs, restore settings",
          testCases: [
            caseFrom(["TC-POL-01", "Sidebar File Manager + active highlight", "P1", "Click each Main item", "/wp-admin/admin.php?page=offload-media-settings#file-manager", "", "Click each Main sidebar item, including File Manager. Refresh on #file-manager.", "File Manager is in the sidebar. Active item is highlighted. Refresh keeps the same hash screen (#file-manager stays File Manager)."]),
            caseFrom(["TC-POL-02", "No fatals / no error popups", "P1", "Plugin screens + PHP log", "", "", "Click around plugin screens used in this pass.", "PHP log has no fatals during this pass. No repeated server error popups while clicking around."]),
            caseFrom(["TC-POL-03", "Optional stress", "P1", "Bulk Operations Durable Job Engine", "/wp-admin/admin.php?page=offload-media-settings#bulk-operations", "A larger library, or mark Skipped if not in scope.", "Sync 100+ files; Verify 100+ files.", "Pause/resume and finish."]),
            caseFrom(["TC-POL-04", "Turn optional features back OFF", "P0", "General Settings", "/wp-admin/admin.php?page=offload-media-settings#general-settings", "", "Leave cache busting / static assets / safety in the intended production state.", "Site healthy. Team knows: with safety ON, verify before mass Delete from Server."]),
          ],
        },
      ],
    },
  ],
};

const ids = [];
for (const section of catalog.sections) {
  for (const sub of section.subsections) {
    for (const test of sub.testCases) ids.push(test.id);
  }
}
if (new Set(ids).size !== ids.length) {
  const seen = new Set();
  const dupes = ids.filter((id) => seen.has(id) || !seen.add(id));
  throw new Error(`Duplicate ids: ${dupes.join(", ")}`);
}

writeFileSync(
  new URL("../public/data/test-cases.json", import.meta.url),
  JSON.stringify(catalog, null, 2) + "\n"
);
console.log(`Wrote ${ids.length} test cases`);
