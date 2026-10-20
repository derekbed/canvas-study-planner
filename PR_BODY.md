## Summary

- polish Coursewise dashboard, calendar, loading, and responsive interactions across the web app
- improve workspace request handling, caching, selectors, and status feedback
- make the Canvas extension load seamlessly and correct dark-mode contrast across Inbox, Calendar, Account, notification, and dialog views
- reveal Canvas within two seconds if extension workspace loading stalls
- improve extension course loading performance and retain current store screenshots

## Verification

- `git diff --check` passes
- `node --test extension/tests/*.test.mjs` passes (43 tests)
- `node --test site/scripts/roadmap.test.mjs` passes (15 tests)
- `pnpm build` passes in `site/`
- headless Chrome startup smoke test passes with responsive, stalled, and absent-consent mock Canvas states
- `pnpm lint` reports 8 existing errors and 4 warnings in files and lines unchanged from `main`

## Notes

Generated extension packages and versioned ZIP archives are excluded from this source PR. Release packages can be rebuilt from `extension/scripts/build-local-release.mjs`.
