<!-- bmad:context -->
<!-- Verified 2026-08-30 against 4dd8127. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## kopiika

Offline-first, local-first personal finance tracker. Expo/React Native, TypeScript, Drizzle ORM + expo-sqlite, Zustand, NativeWind. No bank-account linking; balances always derive from an immutable transaction log. Domain/architecture rules: `docs/architecture.md`; sync design: `docs/sync-design.md`. Tickets: Linear (KII-prefixed), via Linear MCP.

## Policy

- Never `git commit --amend` without the user explicitly asking — make a new commit instead.
- Never squash-merge — PR commits land on main as-is; clean up history via fixup rebase before merging.
- Branch names are `type/short-slug` (e.g. `fix/await-db-transactions`), never Linear-issue-id style.
- Repo is hosted on Codeberg (Forgejo) — use `fj` for PRs/issues, not `gh`.
- `docs/superpowers/` is gitignored by design — write specs there, never `git add -f` or try to commit them.

## Where things are

- Test-layer selection (unit vs component vs Detox): `docs/testing.md`, `e2e/README.md`
- Release process and command boundaries: `docs/RELEASING.md`
- Migration workflow: `drizzle/README.md` — read before touching `drizzle/`
- CI: `.forgejo/workflows/ci.yml`
- Touching check or E2E tasks? `mise.toml` and `hk.pkl` carry their own gotcha comments (parallel-check SIGTERM behavior, fish/xcpretty pipefail, hk's `check_diff` skip) — read them first.

## Running and verifying

- `bun test` (bare) runs Bun's own test runner over every test file, Jest ones included — produces false `jest.mock` failures. Use `bun run test`, or `bun run test:unit` / `bun run test:component` individually.
- CI runs static checks and `bun run test`, but not Detox E2E — run `bun run test:e2e:ios` / `:android` locally before merging changes touching native gestures, drag-and-drop, or app lifecycle.

## Conventions that differ from defaults

- Never call `crypto.randomUUID()` / `crypto.getRandomValues()` directly — Hermes on RN 0.83 doesn't polyfill Web Crypto; tests pass in Node but the app crashes on-device. Use `expo-crypto` (`src/utils/ids.ts`).
- Tests assert on the exact data the test itself created, never an `atIndex(0)`/"first row" shortcut — the seeded `Balance Adjustments` system entity (migration `0001`, always EUR, sorts first) breaks index-based assumptions even against a fresh DB.
- Drizzle reads through expo-sqlite are synchronous and block the JS thread — background/bulk reads need keyset paging plus idle/frame yields (see the phase-2 hydration pattern in `src/store/index.ts`, KII-144).
- Animate collapsing views via `maxHeight`, not `height` — `height` only animates the closing direction.

## Known pitfalls

- Combining `removeClippedSubviews` with per-row `GestureDetector` taps kills taps after scrolling — Jest can't catch it (RNGH is mocked). Keep it `false` on interactive lists (`app/(tabs)/history.tsx`).
- `router.replace()` from a root `_layout.tsx` effect is silently dropped on iOS — render `<Redirect>` from a child layout instead.
- Fish eats backticks in inline commit messages — pass `git commit -m` a quoted heredoc, verify with `git log -1`.
- Transactions have four insert sites; the one inside `import.replace_all` in `src/sync/apply-operation.ts` is easy to miss and silently NULLs a new column on CSV restore.
- Native iOS builds: never `rm -rf ios/build` (breaks arm64 simulator builds — use `expo prebuild --clean`); Release `xcodebuild` also reuses a stale `main.jsbundle`, same fix.
- Detox: scroll-then-tap on a virtualized list races RN's render with sync disabled suite-wide — scope `device.enableSynchronization()` tightly around the scroll+tap, not globally.
- `useAnimatedStyle` must return the same style keys on every branch — a dropped key is never reset, and Jest's Reanimated mock won't catch it.

<!-- /bmad:context -->
