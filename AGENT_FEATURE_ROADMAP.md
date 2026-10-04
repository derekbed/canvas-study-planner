# Coursewise Feature Roadmap

## Goal

Make Coursewise a dependable study workspace for high school and college students. Help students understand what is due, decide what to work on next, and improve their grades using their own course information.

## Project context for the next coding agent

- The app is in [`site/`](./site/). Start with the root [`README.md`](./README.md) and [`site/README.md`](./site/README.md).
- The app already has a calendar, courses, grade scenarios, weekly study blocks, in-app reminders, course material uploads, AI chat, flashcards, practice quizzes, and links to relevant videos and Quizlet sets. Check the current code before implementing a roadmap item; some ideas below are improvements to existing features.
- Canvas OAuth depends on a school-approved developer key. The app also has an `.ics` calendar feed importer for schools where students cannot create personal access tokens. Do not assume an `.ics` feed includes grades, course membership details, or full assignment instructions.
- Calendar import is an active local work area. Inspect `site/app/api/calendar/import/route.ts` and `site/components/coursewise-app.tsx` before changing it. Preserve the `.ics` file upload fallback and do not log or persist the secret feed URL.
- Develop and verify locally. Do not publish the Site unless the user asks.

## Recommended order

### Priority 1: Make the calendar dependable

- [ ] Make repeated imports safe and idempotent: update existing imported events, add new ones, and handle removed or cancelled items without duplicating dates.
- [ ] Preserve manual events and courses when an import succeeds or fails. Show a clear summary of added, updated, and removed Canvas dates.
- [ ] Match imported events to courses when the feed provides enough information; otherwise label them as Canvas calendar items and let the student assign a course.
- [ ] Show the source and last successful import time. Explain common errors such as revoked feeds, expired links, and school restrictions.
- [ ] Keep feed URLs private: do not expose them in client errors, logs, analytics, or database fields.
- [ ] When full Canvas OAuth is available, sync assignment descriptions, course names, points, and direct Canvas links in addition to calendar dates.

### Priority 2: Help students choose what to do next

- [ ] Add a prioritized dashboard that ranks upcoming work using due date, estimated effort, completion state, and grade impact.
- [ ] Explain each recommendation in plain language, such as “This is due tomorrow and counts for 20% of your grade.” Show when information is missing.
- [ ] Improve the grade calculator with weighted categories, target final grades, and what-if score scenarios.
- [ ] Improve weekly study plans with editable availability, realistic session lengths, and an easy way to reschedule missed sessions.
- [ ] Add a progress view for completed work, upcoming deadlines, and grade trends.

### Priority 3: Make course materials useful

- [ ] Extract syllabus dates, grading weights, major requirements, and exam policies from uploaded files. Show the source page or section and let the student confirm dates before adding them.
- [ ] Make course AI chat cite the uploaded file and page or section behind each answer.
- [ ] Let students generate flashcards, quizzes, study guides, and mock exams from selected course materials.
- [ ] Add spaced repetition and track which cards or topics need more review.
- [ ] Improve external video and study-resource results with topic matching and a short explanation of relevance.

### Priority 4: Improve day-to-day use

- [ ] Let students choose reminder timing and delivery. Keep browser notifications optional, and clearly explain that in-app reminders require the site to be open.
- [ ] Add a focus timer with short breaks and a simple record of completed sessions.
- [ ] Make calendar and study-plan views comfortable on mobile and usable with keyboard navigation and screen readers.
- [ ] Offer export to Google Calendar, Apple Calendar, or a downloadable `.ics` file.
- [ ] Add a weekly summary of deadlines, planned study time, and progress.

### Priority 5: Build trust before broader release

- [ ] Add controls to export and delete a student's courses, calendar data, and uploaded materials.
- [ ] Explain what came from Canvas, what the student entered, and what AI generated.
- [ ] Keep uploaded materials private to the student's account and avoid sending more text to AI services than a request needs.
- [ ] Support materials the student is authorized to use; do not require full textbook uploads when excerpts, notes, or assigned readings will work.
- [ ] Before a public student launch, plan student sign-in, consent, data retention, school onboarding, and reminders that work when the browser is closed.

## Suggested first implementation slice

Start with **calendar import reliability** and **course matching**. They improve the existing calendar immediately and provide better inputs for reminders, study plans, grade impact, and AI recommendations. Preserve current local data during failure cases, and include a concise user-facing explanation for each import outcome.

## Definition of done for each feature

1. The UI explains what the feature does and what data it uses.
2. Existing courses, manual events, and user-entered settings remain intact unless the user explicitly changes them.
3. Errors are actionable and do not expose private Canvas feed URLs, uploaded text, or credentials.
4. The feature works in the local development setup documented in `site/README.md`.
5. Documentation is updated when setup steps, data behavior, or supported Canvas access changes.
