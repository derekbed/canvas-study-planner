# Coursewise web app

This is the working student interface and server for the Coursewise preview.

## Local development

Use Node.js 22.13 or newer and pnpm:

```sh
pnpm install
pnpm db:generate
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_natural_alice.sql
pnpm dev
```

Apply each new migration only once to a local preview database. The app uses a local sample student when served from localhost; deployed requests require a signed-in Site user.

## Server configuration

See [.env.example](./.env.example). The Canvas callback URL is `https://<site-host>/api/canvas/callback`. A configured school developer key and token encryption key enable Canvas OAuth. An OpenAI API key enables study chat and generated flashcards and quizzes. Keep credentials in server secrets, never in client code or Git.

## Storage

Course data, assignments, plan blocks, and indexed text use D1. Uploaded file bytes use R2. Uploaded PDFs are parsed on the server and saved with page markers and table-column schedule context. Text from scanned pages still requires OCR.

## Roadmap update

Apply the added migration to an existing local database once (after a build produces `dist/server/wrangler.json`):

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_noisy_owl.sql
```

A fresh database needs both `0000_natural_alice.sql` and `0001_noisy_owl.sql`, in order. Do not rerun an applied migration. `pnpm db:generate` is for future schema edits, not routine startup.

### Student tools

- **Today** ranks unfinished work using deadlines, effort, points/category weights, and grade goals. It explains missing inputs and shows a seven-day summary plus completion and recorded grade history.
- **Calendar** reconciles the previous Canvas feed atomically by UID, including removed and cancelled dates. Manual courses/dates, completion, scores, and course assignments survive reimports. The import summary and last successful time are saved. An empty valid feed clears only previous feed items. Use the same feed for each import; multiple simultaneous feeds are not supported.
- **Course matching** uses a Canvas course URL or an exact course name/code in categories or square brackets. Unmatched items remain labeled Canvas calendar items, and students can assign them in event details. The details editor also supports effort, grading category, points, and actual scores.
- **Grade lab** supports category weights totaling 100%, target final grades, and score scenarios. Incomplete categories suppress weighted projections instead of silently assuming zeros. Estimates only cover listed work; drop rules, extra credit, and future unlisted assignments require verification.
- **Study plan** supports available days, a daily time window, total hours, session length, five-minute breaks, completion, and rescheduling missed sessions. Dates and windows use the student's device time zone. Some work may not fit before its deadline; the app reports this.
- **Materials** retain PDF page markers or text section labels. Review extracts candidate dates, weights, requirements, and exam policies locally. Students verify and edit each candidate date before adding it. This is text pattern extraction, not a complete syllabus interpretation; tables, images, scans, and ambiguous dates need manual review. Older PDFs without page markers use section citations until reuploaded.
- **AI study chat** uses full short syllabi or relevant passages from larger selected files, includes a compact course brief and relevant stored facts when available, and requests filename/page or section citations. After enough conversation, it saves a short rolling summary instead of replaying the whole chat. Flashcards, quizzes, study guides, and mock exams are labeled as AI-generated. Responses and citations require student verification. OpenAI configuration and Data & privacy consent are required.
- **Review** persists flashcards and review dates. Again schedules ten minutes, Hard one day, and Remembered doubles the interval starting at two days, capped at 180 days. Difficult cards are listed for extra review.
- **Focus timer** supports timed focus, a five-minute break, pause/reset, and idempotent saving of completed sessions. An active timer survives tab switches but resets on page reload; saved sessions persist.
- **Reminders** offer timing and optional browser notification delivery while the page stays open. Browser permission alone does not opt the student in. Background delivery is not implemented; see the launch plan.
- **Resources** combine the selected course and topic in YouTube and Quizlet searches and explain the match. These are external search links, not vetted results or provider API integrations.
- **Data & privacy** provides AI excerpt consent, JSON export, original file downloads, an `.ics` calendar snapshot for Google/Apple Calendar, and deletion of a course or entire workspace. Deletion does not recreate sample data. Files and queries are scoped to the authenticated account.

### Import limits and privacy

Imports accept complete Canvas calendars up to 5 MB and 500 events. Recurrence rules are rejected rather than silently losing occurrences. UTC and IANA `TZID` dates are supported; floating/all-day dates use the calendar's time zone or the importing device's time zone. Redirecting, revoked, expired, or school-restricted links show a safe error and keep previous data. Uploading the downloaded `.ics` file remains available. Feed links are never saved, logged by the import handler, included in errors, or added to analytics. The application defines no analytics collection.

### Verification

```sh
node --test scripts/roadmap.test.mjs
node node_modules/typescript/bin/tsc --noEmit
pnpm build
```

The regression suite uses an isolated in-memory SQLite database and actual route handlers with a local D1/R2 adapter. It checks reconciliation, preservation, account isolation, time zones, grading, scheduling, saved reviews, deletion, and source labels without using real student data or third-party services. Real Canvas OAuth and OpenAI calls still require configured credentials for end-to-end verification.

See [PUBLIC_LAUNCH_PLAN.md](./PUBLIC_LAUNCH_PLAN.md) for identity, consent, retention, school onboarding, and background reminder release gates.

## Local Canvas side panel prototype

The unpacked Chrome extension in [`../extension/`](../extension/) reads visible course or assignment text from the Canvas page the student is already viewing. It requires an explicit question submission before sending the displayed text to this local server and OpenAI. The server combines it with saved materials only for the paired account and only after AI excerpt consent. It does not use private calendar feed URLs, Canvas OAuth, or an extension-side OpenAI key.

Apply `drizzle/0002_slim_zemo.sql` once after building, then follow [`../extension/README.md`](../extension/README.md) to load and pair the extension. Pairing and extension study routes are limited to localhost development. Pairing codes last five minutes; bearer tokens last one hour and can be revoked by signing out. This is not a production authentication design, and live Canvas/OpenAI behavior requires a signed-in Canvas account and a server-side OpenAI key.

## Saved AI conversations

The website, embedded Canvas Ask workspace, and extension side panel use the same
chat service. Chats belong to a user and course; the website and Canvas workspace
can reopen, rename, and delete them. Earlier messages migrate into an “Earlier
conversation” for each course. Apply `drizzle/0005_cooing_masque.sql` once after
migrations 0000–0004; it has already been applied to this local preview database.

Full transcripts and source labels stay in D1. Responses use `store:false` and a
bounded context: up to 10,000 characters of recent conversation, a 2,000-character
thread summary, relevant structured course facts, upcoming work, and at most six
source passages totaling 6,000 characters. Older turns are summarized incrementally;
a summary failure does not advance the memory checkpoint. Actual API token usage
is stored on assistant messages. Savings depend on source length and conversation.

Selected readable documents are embedded lazily after AI consent, using
`text-embedding-3-small` with 512 dimensions. Content hashes reuse unchanged vectors.
Semantic and keyword scores are combined; embedding failures fall back to keyword
search. At most 192 missing passages are embedded per request, so larger libraries
are indexed progressively. This D1-backed index is intended for individual course
libraries; a large deployment should move vectors to an indexed vector database.
Deleting a material clears its vectors; workspace/course deletion clears chats and
vectors. Exports include conversation metadata and source labels. Removing a source
from selection does not erase references to it from earlier conversation turns.

Checks: `node --test scripts/chat.test.mjs scripts/extension.test.mjs
scripts/course-knowledge.test.mjs`, `pnpm exec tsc --noEmit`, and `pnpm build`.
Reload the unpacked Chrome extension and refresh Canvas after updating extension
files. The small Chrome side panel retains its current thread while open; reopen
saved threads in the full Coursewise or embedded Canvas chat UI.
