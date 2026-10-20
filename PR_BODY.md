## Summary

- polish Coursewise dashboard, calendar, loading, and responsive interactions across the web app
- improve workspace request handling, caching, selectors, and status feedback
- make the Canvas extension load seamlessly and correct dark-mode contrast across Inbox, Calendar, Account, notification, and dialog views
- improve extension course loading performance and package updated local and store releases with current screenshots

## Verification

- `git diff --check` passes
- `node --test extension/tests/*.test.mjs` passes (43 tests)
- `node --test site/scripts/roadmap.test.mjs` passes (15 tests)
- `pnpm build` passes in `site/`
- `pnpm lint` reports 8 existing errors and 4 warnings in files and lines unchanged from `main`

## Notes

This PR includes all current workspace changes, including the versioned extension release archives, store package, screenshots, and regression tests added during the refactor.
