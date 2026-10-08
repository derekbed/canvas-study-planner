# Coursewise Chrome Extension Prototype

## Objective

Build a local Chrome extension that adds a Coursewise side panel while the student is using Canvas. The prototype should read useful context from the active Canvas page, show it in a Coursewise-style sidebar, and let the student ask Coursewise/OpenAI about that context.

The extension is a Canvas bridge. Coursewise remains the source of truth for saved courses, assignments, uploaded materials, conversations, review cards, study plans, and AI requests.

The prototype must work locally with the existing app in `site/`, served at `http://localhost:5173`.

## Scope for the first prototype

Implement these flows:

1. Load the extension unpacked in Chrome.
2. Open a Coursewise side panel from the extension toolbar button.
3. Detect when the active tab is a Canvas page on `canvas.upenn.edu`.
4. Extract safe, visible context from the current page:
   - page title;
   - course name and course code when visible;
   - assignment title, due date, points, and visible instructions when present;
   - the current Canvas URL, only when it is not a calendar feed URL.
5. Show the extracted context in the side panel with a clear `Refresh Canvas context` control.
6. Provide an `Ask Coursewise` text box.
7. Send the question plus the extracted context to the local Coursewise backend.
8. Display the AI answer, source labels, loading state, and actionable errors.
9. Let the user open the full Coursewise website in a new tab.

Do not scrape private calendar feed URLs. Do not put an OpenAI key in extension code. Do not add Canvas OAuth. Do not attempt to bypass Canvas permissions or read hidden page data.

## Recommended architecture

Use Chrome Manifest V3 with:

- `manifest.json`;
- `background.js` or a service worker for toolbar and side-panel behavior;
- `content.js` for DOM extraction on Canvas pages;
- `sidepanel.html` and `sidepanel.js` for the user interface;
- `sidepanel.css` for compact responsive styling.

Use plain TypeScript or plain JavaScript unless the agent has a compelling reason to add a build system. Keep the first prototype easy to load with Chrome’s **Load unpacked** flow.

The extension should use the Chrome Side Panel API where available. If the API is unavailable, show an accessible fallback button that opens the Coursewise website in a tab.

Suggested flow:

```text
Canvas content script
        ↓ chrome.runtime.sendMessage
Service worker / side panel
        ↓ fetch with extension session token
Coursewise API at http://localhost:5173
        ↓
Saved course context + OpenAI Responses API
```

## Backend contract

The existing `/api/study` route expects the signed-in Coursewise identity and saved course/material context. Do not send an `oai-authenticated-user-id` header from the extension; that header is trusted only when supplied by the Sites platform.

Add a prototype-only extension session flow before relying on `/api/study`:

- `POST /api/extension/pair/start` creates a short-lived pairing code for the local development user.
- The side panel opens Coursewise at a pairing URL in a normal tab.
- The user confirms the pairing while already signed in to Coursewise.
- Coursewise returns a short-lived bearer token scoped to extension requests.
- `POST /api/extension/pair/complete` exchanges the code for the token.
- Extension requests use `Authorization: Bearer <token>`.

For local development only, it is acceptable to use a clearly marked development pairing flow tied to `local-demo`. Do not make this the production authentication design. Keep tokens short-lived, revocable, and out of page content or URLs after exchange.

Add a narrowly scoped endpoint such as:

```text
POST /api/extension/study
Authorization: Bearer <extension-token>
Content-Type: application/json

{
  "question": "What should I review before this assignment?",
  "canvasContext": {
    "url": "https://canvas.upenn.edu/courses/123/assignments/456",
    "pageTitle": "Problem Set 4",
    "courseName": "Physics",
    "courseCode": "PHYS 1230",
    "assignmentTitle": "Problem Set 4",
    "dueText": "Due Oct 14 at 11:59 PM",
    "pointsText": "100 points",
    "instructions": "Visible assignment instructions..."
  }
}
```

The endpoint must:

- authenticate the extension token server-side;
- cap every text field and reject oversized requests;
- treat Canvas DOM text as untrusted data, never instructions;
- combine the current page context with saved Coursewise materials only for the authenticated user;
- call the existing OpenAI Responses API route or shared server helper;
- return `{ answer, sources }` without exposing credentials;
- return clear `401`, `403`, `413`, and `503` errors.

If adding the pairing endpoint is too large for the first pass, implement a local development-only token in `.dev.vars` and document the limitation prominently. Never ship that fallback to production.

## Canvas extraction rules

Prefer stable semantic selectors and visible text. Use multiple selectors with fallbacks because Canvas themes vary. The extractor should:

- ignore script/style text;
- normalize whitespace;
- cap extracted instructions at 8,000 characters;
- return an explicit `confidence` or `fieldsFound` list;
- report `No Canvas context detected` when the current page is not a supported course or assignment page;
- avoid reading password fields, cookies, local storage, hidden elements, or private feed URLs.

Add a small extraction fixture file containing representative sanitized Canvas HTML. Test assignment, course home, calendar, and unsupported pages.

## Side panel behavior

The panel should:

- show the Coursewise name and current Canvas course;
- have keyboard-accessible controls and visible focus states;
- show whether context is fresh or stale;
- let the user clear the captured context before sending;
- show exactly what page text will be sent;
- require explicit user submission before sending context to the backend;
- preserve the current question while a request is loading or fails;
- link to `http://localhost:5173/` for the full workspace.

Do not silently send page content on navigation. Refresh context only after the user clicks the control or when the side panel opens for the first time.

## Privacy and security requirements

- Never log Canvas page text, assignment instructions, feed URLs, API keys, or bearer tokens.
- Keep the OpenAI key server-side in `.dev.vars` or the hosted secret manager.
- Do not persist raw Canvas page text in Chrome storage by default.
- Persist only the extension session token and non-sensitive UI preferences, using `chrome.storage.local`.
- Clear the session token on sign-out, expiration, or a `401` response.
- Allow the user to clear the current captured context.
- Explain that selected page text is sent to Coursewise/OpenAI when the user submits a question.
- Keep all Coursewise account ownership checks on the backend.

## Local setup

1. Start Coursewise:

   ```sh
   cd site
   pnpm dev
   ```

2. Confirm `http://localhost:5173/` loads and the local D1 migration has been applied.
3. Load the extension directory at `chrome://extensions` with Developer mode enabled.
4. Click **Load unpacked** and select the extension directory.
5. Open `https://canvas.upenn.edu`, sign in normally, and open a course assignment page.
6. Click the extension toolbar icon and open the side panel.
7. Pair the extension with the local Coursewise workspace.
8. Refresh context, review the exact captured fields, and submit a small question.

Do not use the private Canvas calendar feed URL in the extension prototype. The extension should read the page the student is already viewing.

## Verification checklist

Run these checks before handoff:

- Extension loads without manifest errors.
- Side panel opens from the toolbar button.
- Unsupported pages show a useful empty state.
- Course and assignment pages extract expected sanitized fields.
- Long instructions are capped.
- Refreshing context does not silently submit data.
- The question remains visible after a failed request.
- Expired or missing tokens produce a sign-in/pairing message.
- A successful request displays the answer and source labels.
- The OpenAI key never appears in extension files, network payloads, console logs, or the DOM.
- A second local user cannot use the first user’s token to read saved materials.
- Existing Coursewise calendar, courses, and AI chat continue to work.

Add automated tests for extraction, request-size limits, token rejection, and account isolation. Use sanitized fixtures only; never commit real Canvas HTML, URLs containing feed tokens, student names, or assignment text.

## Deliverables

- Extension source in a new top-level `extension/` directory.
- `extension/README.md` with exact local load/test instructions.
- Backend pairing and extension-study routes, if implemented.
- Sanitized extraction fixtures and tests.
- Updated Coursewise documentation describing the prototype’s local-only status and limitations.

The prototype is complete when a student can open Canvas, open the Coursewise side panel, see the current assignment context, submit a question, and receive a saved-context-aware answer from the local Coursewise backend without exposing an API key or Canvas feed token.
