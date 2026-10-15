# Coursewise for Canvas

This is the browser extension source on `main`. It customizes Canvas appearance and shows course cards, grades, deadlines, announcements, and local read state. Course pictures and appearance settings are saved in Chrome storage. The extension works with any HTTPS Canvas school domain the student connects in the side panel.

## Load locally

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select this `extension` directory.
3. Click the Coursewise toolbar icon, accept the data disclosure, and connect your school's Canvas HTTPS address.
4. Reload the Canvas tab.

The same files can be staged for a release with:

```sh
node extension/scripts/build-local-release.mjs --out extension/local-release
```

Only the connected school receives Canvas requests through the student's existing session. Coursewise does not change submissions or grades. See [LOCAL_RELEASE.md](LOCAL_RELEASE.md) for package details and [STORE_SUBMISSION.md](STORE_SUBMISSION.md) for the store checklist.
