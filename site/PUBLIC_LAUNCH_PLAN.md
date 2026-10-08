# Student launch plan

The current application is a private preview. The following is the requested launch plan, not a claim that public school onboarding or closed-browser delivery is operational.

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
- Verify real Canvas sync and real AI outputs with configured test credentials and authorized sample materials.
- Document support ownership, incident response, provider retention, and school escalation contacts.
- Start with a small approved school pilot; expand after observed sync reliability and student feedback.
