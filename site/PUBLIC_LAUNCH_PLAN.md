# Student launch plan

The current application is a private preview. The following is the requested launch plan, not a claim that public school onboarding or closed-browser delivery is operational.

The [ten-point legal checklist audit](./LEGAL_CHECKLIST_AUDIT.md) records the privacy, storage, billing, testimonial, and AI-chat findings from the source review.

## Current implementation and remaining release gates

Implemented in source: public-origin extension API allowlisting; a school-specific HTTPS extension package builder; extension data disclosure before Canvas reads; a server-enforced 13+ confirmation before production workspace access; Chrome session storage for the short-lived pairing token; keyboard operation of the organizer resize handle; narrow-screen calendar reflow; and public-route privacy and accessibility notices.

Do not switch the Site or Chrome Web Store listing to public until all of these are complete:

- Set the legal operator name, support email, actual Site origin, and school Canvas origin. Configure `COURSEWISE_PUBLIC_ORIGIN`, `COURSEWISE_OPERATOR_NAME`, and `COURSEWISE_SUPPORT_EMAIL` in the hosted environment. Review the privacy notice against the actual hosting, logging, backup, OpenAI, and school data flows; specify backup retention and a deletion response process. The notice currently says when the public identity or contact is missing.
- Verify account eligibility with the identity provider and decide how guardians and schools approve use by students under 18. The current 13+ gate is a self-attestation; it does not prove age or obtain parental consent where that is required.
- Obtain each institution's Canvas developer key and permission to run the extension against its Canvas host. For a school-provided service, review FERPA terms, institutional direct control, data-use restrictions, breach notice, accessibility obligations, and student/parent rights with the school. Do not infer school approval from a student's Canvas login.
- Complete a manual WCAG 2.1 AA review of the website and extension with keyboard, screen reader, 320px/400% reflow, 200% text resize, color contrast, and focus order. Fix findings and record results. Source checks and one local narrow-screen browser check are not an audit.
- Run a real end-to-end test on the target school's Canvas host and the actual HTTPS Site: consent, pairing, permission denial, API reads, optional AI, token expiry, export, deletion, and two-account isolation. Test with authorized sample student data.
- Inspect the actual R2 bucket settings: disable its public development URL, attach no public custom domain to student uploads, and verify a synthetic object and owned file routes cannot be fetched anonymously or by another account.
- Prepare the Chrome Web Store listing, screenshots, privacy fields, public policy URL, and developer contact. Confirm its data disclosures match the extension's actual behavior and that the packed extension ID matches the server allowlist.
- Decide whether closed-browser reminders are in scope. The current UI says they require an open tab; do not market background delivery unless implemented and verified.

Reference requirements: [DOJ Title II web rule](https://www.ada.gov/resources/2024-03-08-web-rule/), [DOJ private-business web guidance](https://www.ada.gov/resources/web-guidance/), [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [Education Department vendor guidance](https://studentprivacy.ed.gov/audience/education-technology-vendors), and [Chrome Web Store user-data policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/).

The linked Title II rule directly governs public schools, community colleges, and public universities, including content supplied through arrangements with vendors. The duties of a direct-to-student private service require a separate Title III and contract review. The applicable rule depends on who offers Coursewise and how each institution adopts it.

## Identity and account isolation

Keep the Site private during the pilot and use the platform's authenticated student identity. Every API must enforce ownership; never expose a Worker directly where callers can forge trusted identity headers. Before a public launch, confirm the platform's current sign-in path, school membership checks, recovery, and age-appropriate account eligibility. Verify two independent accounts cannot read, change, export, or delete each other's records or files. Local development uses a sample identity only.

## Consent and materials

The Data & privacy page explains data sources, AI excerpt sharing, export, and deletion. AI requests require an explicit saved opt-in and only selected readable materials contribute excerpts. Upload only authorized notes, excerpts, and assigned readings. Establish school and parent/guardian consent processes where required before recruiting minors. Confirm notice wording, accessibility, provider terms, and school agreements with the responsible institution.

## Retention and deletion

The preview retains records until the student deletes them. Workspace deletion removes active D1 records, R2 originals, chats, review history, and Canvas tokens; a minimal initialized marker prevents demo data from being recreated. Course deletion removes that course's dependent records. Define a production inactivity period, backup retention window, recovery window, and deletion completion SLA with the host before launch; disclose those concrete periods in the UI. Exports and third-party backups are not recalled by deletion. Test deletion retries after partial storage outages.

## School onboarding and Canvas

Arrange a developer key per supported institution and agree scopes and redirect URLs with its administrator. Validate token refresh, revocation, rate limits, pagination, assignment groups, and restricted courses using a school-approved test student. A calendar feed is a fallback with dates only; it is not authorization for grades or full course content. A single saved feed snapshot is supported per student; feed URLs are never retained. Full OAuth cannot be activated by Coursewise alone without the school's key.

## Reminders when the browser is closed

Current in-app and browser reminders need an open tab. Before enabling background delivery, select an operational email or push provider, collect channel-specific opt-in and time zone, store protected delivery credentials, and implement a scheduled queue. Use stable event/version keys for deduplication, quiet hours, retries with backoff, delivery receipts, unsubscribe/revocation, and deletion cleanup. Test closed-tab, offline, changed-deadline, and revoked-permission cases. Do not advertise background notifications until delivery is verified.

## Release gates

- Apply reviewed migrations to staging and verify restore procedures.
- Run regression tests and the production build, followed by keyboard, screen-reader, mobile, and 200% text-size checks.
- Resolve the repository-wide ESLint errors in the existing React views and test harness before treating lint as a passing release gate. The targeted legal-notice and safety source files pass lint, but the full lint command currently fails.
- Verify real Canvas sync and real AI outputs with configured test credentials and authorized sample materials.
- Document support ownership, incident response, provider retention, and school escalation contacts.
- Start with a small approved school pilot; expand after observed sync reliability and student feedback.
