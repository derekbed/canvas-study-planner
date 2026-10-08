# Coursewise Canvas bridge · local prototype

For the extension-only first launch, use [LOCAL_RELEASE.md](LOCAL_RELEASE.md). Its build includes Canvas appearance and read-only study summaries without the website, account pairing, or AI features. The instructions below describe the full development prototype retained for a later edition.

This unpacked Manifest V3 extension starts reading Canvas data only after the student accepts the side-panel data disclosure and confirms they are at least 13. It reads visible text from the Canvas course or assignment page the student is viewing. It does not use Canvas OAuth, hidden page data, a calendar feed, or an OpenAI key. It sends a question and the displayed context only after the student presses **Ask Coursewise**.

## Embedded Canvas workspace

The extension adds **Coursewise** to the Canvas global left navigation, between Calendar and Inbox where those items are present. Click it to open a workspace inside Canvas. **Today** separates assignments, exams and quizzes, announcements, and calendar events, with a course filter. **Courses** shows Canvas grades and deadlines alongside matched saved Coursewise courses. You can save a Canvas course to Coursewise from its card. **Materials** uploads a syllabus to a saved course and lets you delete an upload. **Knowledge** analyzes a readable syllabus automatically after upload when AI excerpt consent is enabled, or when you click **Analyze syllabus**, stores a brief, source-labeled facts and passages, and asks for missing information. Student answers are saved as student-provided facts. **Ask** retrieves only relevant facts and passages plus recent chat and a compact conversation summary. Current page text is optional and is sent only when you check its box. The answer includes source labels and a follow-up form when a relevant fact is missing.

Course matching uses Canvas course ID first, then course code, then exact name. PDF files can be uploaded, but PDF text extraction in the embedded extension is pending; TXT and Markdown are indexed immediately. The Coursewise website can extract PDF text in the browser before upload. The extension stores its short-lived pairing token in Chrome session storage. It keeps Canvas data and page context in memory.

## Production package

The checked-in manifest and scripts remain scoped to the local University of Pennsylvania prototype. To stage a school-specific package, configure the hosted site with `COURSEWISE_PUBLIC_ORIGIN` set to its exact HTTPS origin, then run:

```sh
node extension/scripts/build-release.mjs --site https://study.example.edu --canvas https://canvas.example.edu --out extension/release
```

The builder replaces the local URL and Canvas host, restricts host permissions to those two HTTPS origins, and includes the extension icons. It does not publish to the Chrome Web Store. Before submission, supply the actual public privacy-policy URL, store listing text and screenshots, developer contact, institution approval, and successful keyboard/screen-reader tests. The extension ID must match `site/lib/extension.ts` and the Chrome Web Store listing.

## Canvas appearance

Open the three-dot menu beside **Dashboard**, then choose **Horizontal View** (below **List View**) for wide course cards with the picture and name, the available Canvas actions in a 2×2 grid, and the next deadline along the bottom. The extension remembers this choice; choosing Card View, List View, or Recent Activity switches out of it.

Open the three-dot menu beside **Dashboard**, then choose **Coursewise appearance**. This opens a separate popup, without expanding the announcements organizer. The popup includes **Always light**, **Always dark**, and **Match system**. Match system follows operating-system appearance changes while Canvas is open. Dark mode uses one fixed dark palette for Canvas, the organizer, and the embedded Coursewise workspace. Switching back to light restores your saved pastel or custom background.

The same popup includes course colors and picture upload/removal for saved Coursewise courses. Pictures can be JPEG, PNG, WebP, HEIC, or HEIF files up to 20 MB. Coursewise converts them locally to a compact JPEG before saving, including files whose extension or MIME type is misleading. Changes save automatically through the local backend; a failed save displays an error. Theme preferences are also cached in Chrome local storage for subsequent page loads. Reload the unpacked extension and refresh Canvas after updating extension files.

HEIC decoding uses the CSP-compatible libheif build from [heic-to 1.6.5](https://github.com/hoppergee/heic-to). Its source is included in `vendor/libheif-without-unsafe-eval.js` and its license in `vendor/LICENSE-heic-to.txt`.

## Grade and deadline overlays

On the Canvas dashboard, Coursewise shows a current-grade badge, the nearest future unsubmitted assignment, and a **Course health** button on each course card. The same button works in Card, List, and Horizontal views. It opens a keyboard-accessible detail dialog with deadlines, submissions, recent announcements, grade-trend availability, direct Canvas actions, and the last successful sync time. The health calculation uses only the already fetched Canvas data in page memory; it does not request graded assignment history, so grade trend says **Not enough graded work**. An unavailable assignment feed yields **Limited data**, and stale or partial data is called out. The Coursewise organizer sits in the dashboard's right rail so the course cards remain visible when Canvas opens. Course home pages show a compact card in Canvas's right sidebar, with a ring for the share of assignments marked as read in Coursewise. **View details** opens the organizer. It has separate keyboard-accessible spaces for **Assignments**, **Exams & quizzes**, and **Announcements**, with counts, chronological lists, recent overdue work, and a **Show all** control. Select a space by clicking it or using the left and right arrow keys. Use **Refresh** to request new Canvas data.

In **Assignments**, use the check button to mark an item as read and hide it from the Coursewise list. **Undo** reverses the last check; **Show read** reveals hidden assignments so you can restore any of them. Read state stores only numeric Canvas course and assignment IDs in `chrome.storage.local`, without titles, grades, or page text. Marking an item as read does not submit work, mark it complete, or change anything in Canvas. Course card deadlines still show actual upcoming Canvas work.

The dashboard organizer collapses Canvas's mixed To Do widget when it has items to show; course pages leave Canvas's To Do visible. The ring tracks Coursewise read choices, not Canvas submissions or completed work. Assignments and quizzes are separated using Canvas's quiz metadata and recognizable exam or quiz titles. Some external-tool assessments without quiz metadata or a recognizable title may appear under Assignments. Announcements cover the most recent 30 days. A published assignment may appear before it opens for submission.

These read-only summaries use Canvas's current-user course, enrollment, assignment, and announcement APIs with the student's existing Canvas session. They remain in page memory and are never sent to Coursewise or OpenAI by the overlay. If Canvas hides a grade or blocks an API, the extension shows an unavailable or empty state instead of calculating a substitute. No Canvas OAuth, calendar feed, or extra account access is used.

## Local setup

1. In `site/`, run `pnpm install` if needed, then `pnpm build`.
2. Apply `site/drizzle/0000_natural_alice.sql`, `0001_noisy_owl.sql`, `0002_slim_zemo.sql`, and `0003_cuddly_namora.sql` in order to a fresh local D1 database. For an existing database, apply only the migrations it does not have yet. For example, to add the extension session tables:

   ```sh
   cd site
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_slim_zemo.sql
   ```

   Apply `0003_cuddly_namora.sql` to add course knowledge and indexed passages. This migration has already been applied to the local database in this workspace:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_cuddly_namora.sql
   ```

3. Set `OPENAI_API_KEY` in the site's ignored `.dev.vars` or hosted secret manager. Run `pnpm dev` in `site/` and open `http://localhost:5173/`. Sign in through the local Coursewise sign-in page and enable **Data & privacy → AI excerpt consent**.
4. In Chrome, visit `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this top-level `extension/` directory. The manifest includes a public key to keep its local extension ID stable; the dev server allows only that ID for cross-origin requests.
5. Open a course assignment at `https://canvas.upenn.edu` after signing in normally. Click the Coursewise toolbar button. Chrome 114+ opens the side panel; an older browser opens Coursewise in a new tab.
6. In the side panel, accept the data disclosure, then click **Pair with Coursewise**. Confirm in the normal Coursewise tab while signed in, return to the panel, and click **Finish pairing**. The extension stores only the one-hour token in Chrome session storage. The pairing code expires after five minutes.
7. Click **Refresh Canvas context**, expand **Exact page text to send**, enter a question, and click **Ask Coursewise**. The answer and source labels appear in the panel.

For the embedded workflow, open Canvas, click **Coursewise** in its left rail, and pair using **Pair with Coursewise** if prompted. Confirm in the local Coursewise tab, return to Canvas, and click **Finish pairing**. Choose a saved course in **Materials** to upload a syllabus. In **Ask**, choose that course, review the selected material sources, optionally include the previous Canvas page context, and submit a question. Use the browser Back button to return to the prior Canvas view.

To give Coursewise course context, upload a readable PDF, TXT, or Markdown syllabus. With AI excerpt consent enabled, Coursewise builds the context automatically. You can also open **Knowledge** and click **Analyze syllabus** to retry or refresh it. Analysis sends up to 65,000 characters of the syllabus to Coursewise/OpenAI. Review the extracted facts and source labels. Fill in missing dates or policies in the prompts; those answers remain labeled **Student provided**. Coursewise saves the resulting course brief, facts, passages, and a rolling chat summary in D1. Ask retrieves only relevant evidence. Deleting a material removes facts and passages sourced from it; deleting a course or workspace removes its knowledge record.

After editing extension files, click **Reload** for the unpacked extension at `chrome://extensions`, then reload the Canvas tab. If the local backend routes changed, restart `pnpm dev` in `site/`.

### Manual verification

- Confirm Coursewise appears in the left rail and opens inside Canvas; Back restores the prior view.
- Pair, upload a readable PDF, TXT, or Markdown syllabus to an owned course, and confirm it appears under that course as indexed.
- Check that assignments, exams and quizzes, and announcements remain separate in Today.
- Submit a question in Ask and check that the answer shows source labels. The question should stay in the box after an error.
- In Knowledge, analyze a readable syllabus and confirm the brief and facts show source labels. Fill a missing exam date or late policy, then check that it appears as Student provided.
- Ask a question about a missing policy and confirm Coursewise asks for the missing detail. Save the answer and ask again to confirm it uses the new fact.
- Sign out or wait for the token to expire; the workspace should request pairing again.
- Check that no bearer token, OpenAI key, or private calendar feed URL appears in the Canvas page or extension console.

If the content script cannot be reached after loading or updating the extension, reload the Canvas tab and refresh again. On unsupported pages, the panel shows an empty state. Use **Clear context** to discard the in-memory page text. **Sign out** revokes the token locally and on the local server.

## Tests

From the repository root, run `node --test extension/tests/*.test.mjs` for sanitized extraction fixtures. From `site/`, run `node --test scripts/extension.test.mjs` for request limits, token handling, and account isolation. Run `node node_modules/typescript/bin/tsc --noEmit` and `pnpm build` for the backend.

## Limits

The checked-in package is a local development flow restricted to `http://localhost:5173`. Hosted pairing is enabled only for an exact configured HTTPS site origin and the pinned extension ID. Saved materials are used only when the visible Canvas course matches a saved Coursewise course by Canvas ID, code, or exact name, and the account has AI excerpt consent. Canvas themes may need selector updates. A live Canvas account and server OpenAI key are needed for an end-to-end question.
