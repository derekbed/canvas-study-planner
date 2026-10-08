# Coursewise local extension

This first-release edition provides Canvas appearance, dashboard course cards, grades, deadlines, course health, announcements, and read-state organization. It has no Coursewise website, account pairing, chat, AI requests, uploaded materials, or backend. Canvas data is fetched through the student's signed-in Canvas browser session and used on the page. Appearance choices, connected domains, course names and pictures, and read-state IDs are saved in Chrome local storage.

## Build and try it

```sh
node extension/scripts/build-local-release.mjs --out extension/local-release
```

Load `extension/local-release` through `chrome://extensions` → Developer mode → Load unpacked. Click its toolbar button, read and accept the disclosure, then enter the HTTPS address of your school's Canvas site. Chrome asks for access to that exact school domain. Reload open Canvas tabs after connecting. Coursewise works with multiple connected schools, keeping course appearance and read-state separate by Canvas origin. Use the Dashboard three-dot menu → Coursewise appearance.

The generated package requests no site access at install time. It declares optional HTTPS host access and asks for one school domain at a time. It includes no embedded workspace, page-text extractor, pairing API, or AI code. The existing website and AI source remain in this repository for a later edition.

## Store submission

The package targets Chrome 119 or later. Build a ZIP containing only the files inside `extension/local-release`, then upload it to the Chrome Web Store Developer Dashboard. Use [STORE_SUBMISSION.md](STORE_SUBMISSION.md) for proposed listing text, permission explanations, privacy declarations, and final gates.

`privacy.html` is an in-extension copy. The public policy is live at https://derekbed.github.io/canvas-study-planner/ and belongs in the Chrome Web Store privacy field. A full website or Coursewise backend is not required.

## Safe store screenshot

Take one screenshot of the actual installed release before connecting any school. Open a blank Chrome tab, open the Coursewise side panel, and leave the initial consent screen visible. That screen contains no Canvas account information. Capture the browser window, crop to the side panel and surrounding Chrome context, and export at 1280×800 or 640×400 pixels without stretching the image. Check the final file for account names, course names, grades, browser profile details, and notifications before uploading it. Store screenshots should show the real extension UI; a privacy-policy page or generated mockup is not a substitute.

## Screen-reader check

On macOS, press Command+F5 to start VoiceOver. With the side panel open, press Control+Option+Right Arrow to read through its heading, privacy link, consent checkbox, and Continue button. Use Tab and Shift+Tab to confirm the same controls are reachable in order. Check the box with Space, activate Continue with Return or Space, and confirm VoiceOver announces the “Connect your school's Canvas” heading. Then check that the Canvas address field has a spoken label, form errors are announced, and each connected school's Disconnect button has a distinct spoken name. Repeat at 200% Chrome zoom. Press Command+F5 to stop VoiceOver.

Run `node --test extension/tests/*.test.mjs` for automated checks. Test the installed package on representative Canvas deployments, including a custom school domain, and run keyboard and screen-reader checks before submitting. Schools may customize Canvas; no code-only check can prove compatibility with every deployment.
