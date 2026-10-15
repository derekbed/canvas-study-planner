# Coursewise web app

The site is a student planner with course dates, calendar import, grade goals, study plans, uploaded files, manual flashcards, a focus timer, reminders, export, and deletion. Canvas OAuth is available when a school developer key is configured.

## Local development

Use Node.js 22.13 or newer and pnpm. Install dependencies, apply the existing `drizzle/*.sql` migrations in order to a local D1 database, and run `pnpm dev` from this directory. The Canvas callback URL is `https://<site-host>/api/canvas/callback`; see [.env.example](./.env.example) for the server secrets.

The existing migrations include tables from earlier preview features. Keep applied migration files intact so existing databases can be upgraded safely. Do not run `pnpm db:generate` against a production database without reviewing the generated SQL for unexpected table drops. This release does not serve the earlier AI or extension pairing routes.

## Student features

- **Today** ranks unfinished work using deadlines, estimated effort, points, and grade goals.
- **Calendar** imports Canvas `.ics` feeds or files and reconciles updates without replacing manual dates.
- **Courses** keeps grades, assignments, and uploaded PDF or text files together. Local text parsing suggests syllabus dates and rules for the student to confirm.
- **Grade lab** shows category weights, target grades, and score scenarios with missing inputs called out.
- **Study plan** schedules work inside available days and hours, with rescheduling and completion.
- **Review** stores student-written flashcards and schedules later reviews.
- **Focus timer and reminders** track sessions and show upcoming work while the site is open.
- **Data & privacy** exports workspace data and calendar `.ics`, offers original file downloads, and lets the student delete a course or workspace.

Run `node --test scripts/roadmap.test.mjs` and `pnpm build` to check the site before release.
