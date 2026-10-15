# Coursewise v2 Handoff

## Scope

This branch contains the current Coursewise for Canvas dashboard customization work, including course-card sizing, appearance controls, course pictures, the card popout menu, theme support, and local extension packaging.

## User-facing changes

- Course cards can be scaled diagonally while preserving their aspect ratio.
- Course images can be uploaded from a course card's three-dot menu and saved persistently.
- Saved course images are restored anywhere the course appears.
- The appearance dialog uses one **Save** action for changes made in that tab.
- Per-course color editing was removed from Coursewise settings.
- The native course-card `Move` tab is relabeled `More`.
- `More` keeps Canvas' move and favorite actions and includes **Course picture**.
- Native course popouts and Coursewise menus inherit the active Canvas light, dark, or system theme.
- The active extension is **Coursewise for Canvas**.

## Important implementation notes

- `extension/insights.js` handles dashboard card controls, course-picture persistence, popout menu enhancement, and card scaling.
- `extension/appearance.css` contains Canvas theme styling for Coursewise UI and Canvas' native tabbed course popout.
- `extension/background.js` registers content scripts for user-connected Canvas origins in the local build.
- `extension/scripts/build-local-release.mjs` stages the school-independent local package in `extension/local-release`.
- The local package intentionally uses dynamic content-script registration after a Canvas origin is connected; it does not include a static `content_scripts` block in its generated manifest.

## Build and verification

Run the full extension test suite:

```sh
/Users/Derek/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-concurrency=1 extension/tests/*.test.mjs
```

Latest result: **52 passing, 0 failing**.

Build the local extension package:

```sh
/Users/Derek/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node extension/scripts/build-local-release.mjs --out extension/local-release
```

After rebuilding, open `chrome://extensions`, reload **Coursewise for Canvas**, and refresh `https://canvas.upenn.edu/`. The disabled **Coursewise Canvas Bridge (Local Prototype)** entry should not be used.

## Repository state

The branch includes the existing implementation changes, test updates, local-release assets, and visual proof files already present in the workspace. Review `git status` before future cleanup so generated proof artifacts are not removed accidentally.

