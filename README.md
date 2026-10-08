# Coursewise

Coursewise is a Canvas-connected study planner for high school and college students. It combines course dates, grade goals, study blocks, uploaded materials, and course-aware AI chat in one workspace.

The application lives in [site](./site).

The private preview's release checks are in the [student launch plan](./site/PUBLIC_LAUNCH_PLAN.md) and [ten-point legal checklist audit](./site/LEGAL_CHECKLIST_AUDIT.md).

The local Chrome prototype lives in [extension](./extension). On Canvas, its organizer separates assignments, exams and quizzes, and announcements while showing course grades and next deadlines. It uses the signed-in student's Canvas session for read-only summaries; the Coursewise side panel sends page context to the local backend only when the student submits a question. See the extension README for setup and limitations.

## What works now

- Week, month, and agenda calendar views with course filters and detailed assignment panels
- Manual courses and dates, plus a sample workspace for exploring the product
- Canvas OAuth and course sync when a school developer key is configured
- Syllabus, textbook excerpt, and notes upload as PDF, TXT, or Markdown; readable text is indexed by course
- Target grades, assignment score scenarios, and a priority list with explicit calculation assumptions
- Weekly study blocks based on available days, hours, deadlines, point values, and estimated effort
- In-app reminders and browser alerts while the site is open
- Course-aware AI chat, flashcards, and practice quizzes when an OpenAI API key is configured
- Search links for related YouTube videos and Quizlet sets

## Run locally

Install Node.js 22.13 or newer and pnpm, then:

```sh
cd site
pnpm install
pnpm db:generate
pnpm build
pnpm dev
```

The site uses Cloudflare D1 for course data and R2 for uploaded files. For a local D1 preview, apply each new `drizzle/*.sql` migration using the Wrangler command in the [starter instructions](./site/README.md). The Sites deployment flow applies migrations when publishing.

## Connect a school

Canvas OAuth needs a developer key from the school's Canvas administrator. Set `CANVAS_BASE_URL`, `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`, and a random 32-byte base64 `TOKEN_ENCRYPTION_KEY` as server secrets. Add the site's `/api/canvas/callback` URL to the developer key's approved redirect URLs. The app requests only the data it uses; the institution can further restrict scopes on its key. The current setup connects one Canvas institution. Supporting arbitrary schools requires developer-key arrangements per institution.

Set `OPENAI_API_KEY` to activate study chat and generated materials. `OPENAI_MODEL` is optional and defaults to `gpt-5.6-terra`. Never commit these values to GitHub.

## Before a public student launch

This deployment remains an owner-private product preview. The website now gates production workspace APIs on a 13+ confirmation, and the extension requires an initial Canvas data disclosure. A public release still needs verified student identity and guardian/school processes, a named operator and support contact, concrete provider retention terms, institution onboarding, full accessibility testing, and review of textbook upload and AI data handling. Grade estimates depend on the work and grading rules available from Canvas; the UI identifies missing inputs. See the [student launch plan](./site/PUBLIC_LAUNCH_PLAN.md) for the remaining release gates.

## Expanded study workspace

The roadmap implementation adds a prioritized Today dashboard, import reconciliation and course matching, weighted grading categories, editable study windows and missed-session rescheduling, cited material study tools, syllabus date review, spaced repetition, focus sessions, weekly progress, and export/deletion controls. See the [feature and setup notes](./site/README.md#roadmap-update) for behavior and limits, and the [student launch plan](./site/PUBLIC_LAUNCH_PLAN.md) for requirements before broader release.
