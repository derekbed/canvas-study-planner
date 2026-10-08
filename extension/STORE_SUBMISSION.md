# Chrome Web Store submission draft: Coursewise for Canvas

This document applies only to the generated local edition in `extension/local-release`. Confirm all statements against the final ZIP and the Chrome Web Store dashboard before submitting.

## Store listing

**Name:** Coursewise for Canvas

**Short description:** Customize Canvas and organize courses, deadlines, grades, and announcements in your browser.

**Single purpose:** Help students view and organize their signed-in Canvas coursework with local appearance and dashboard tools.

**Description:**

Coursewise adds appearance settings and course organization tools to the Canvas sites you connect. Choose light, dark, or system appearance; customize course colors and pictures; see current Canvas grades and upcoming deadlines; review course health and announcements; and mark assignments as read in a local organizer. Coursewise uses your existing Canvas sign-in. It does not submit assignments, change grades, send Canvas data to a Coursewise server, or use AI. Connect a school by entering its HTTPS Canvas address in the side panel and approving Chrome's request for that exact domain. You can disconnect a school at any time.

**Support:** `canvascoursewise@proton.me`. Public policy and support contact: `https://derekbed.github.io/canvas-study-planner/`.

## Privacy dashboard notes

- **sidePanel:** Shows the consent and school connection controls in Chrome's side panel.
- **storage:** Saves consent, connected school domains, appearance settings, course names and pictures, organizer layout, and numeric read-state IDs in Chrome local storage.
- **scripting:** Registers packaged Canvas scripts only for school domains the user explicitly connects.
- **Optional HTTPS host access:** Allows users at any school with an HTTPS Canvas domain to grant access to that exact domain. No host access is requested at installation; no other domain is registered automatically.
- **Remote code:** None. All executable JavaScript is included in the extension package. Canvas API responses are data, not executable code.
- **Data handling:** The extension processes Canvas course names, grades, assignments, announcements, and relevant Canvas URLs in the browser. Course names and appearance choices are stored locally; grade and announcement details stay in page memory. The extension does not transfer Canvas data to a Coursewise server or third-party analytics/advertising service. Canvas requests use the student's existing Canvas session to the connected school domain.
- **Limited use:** Certify only after confirming the final package and public privacy policy match these practices. Treat Canvas data and website content as user data in the dashboard declarations; do not mark the extension as handling no user data.
- **Privacy-policy URL:** `https://derekbed.github.io/canvas-study-planner/` (deployed and verified October 7, 2026). Use this public policy in the dashboard. The bundled `privacy.html` is an in-extension copy, not the dashboard URL.

## Release gates

1. Confirm the operator name and that `canvascoursewise@proton.me` is monitored. Review the policy and listing for applicable student-data requirements. The public HTTPS privacy-policy URL is live.
2. Capture at least one screenshot of the real extension UI at the dimensions accepted by the dashboard. The onboarding side panel can be shown before connecting a school, so no student data needs to appear. Do not reveal a student's private grades in the listing.
3. Test with signed-in Canvas accounts on several deployments, including an `instructure.com` subdomain and a school custom domain. Verify add, reload, appearance, grades, deadlines, announcements, read-state, disconnect, and permission denial/revocation.
4. Complete keyboard, zoom, and screen-reader checks of the side panel and injected Canvas UI. Fix failures found.
5. Upload the final ZIP, complete all dashboard privacy and permission fields, add screenshots and support contact, and submit for Chrome review. The store review is the final publication gate.

The current code and automated tests do not establish legal compliance or universal compatibility with every school's Canvas customizations.
