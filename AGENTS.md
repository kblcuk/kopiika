# Repository Guidelines

## Project Structure & Module Organization

`app/` contains Expo Router screens and route-level tests in `__tests__/`. Shared UI lives in `src/components/`, business logic in `src/utils/`, state in `src/store/`, and SQLite/Drizzle code in `src/db/`. Static assets are under `assets/`. Native Expo projects live in `ios/` and `android/`. Release and signing automation is in `fastlane/`, small maintenance scripts live in `scripts/`, and product/domain decisions are documented in `docs/architecture.md`.

## Architecture & Product Rules

Read `docs/architecture.md` before changing data flow, transaction behavior, plans, or major UI patterns. The short version: `entities`, `plans`, and `transactions` are the core model; balances are derived, overspending stays visible, and drag-and-drop remains the primary interaction.

## Build, Test, and Development Commands

Use Bun for repo scripts.

- `bun run start`: start the Expo dev server.
- `bun run ios` / `bun run android`: run the app in a simulator or emulator.
- `bun run web`: run the web target.
- `bun run test`: run Bun unit tests plus Jest component/screen tests.
- `bun run test:coverage`: collect coverage from both test runners.
- `bun run lint`: run `oxlint`.
- `bun run format` / `bun run format:check`: apply or verify `oxfmt`.
- `bun run types`: run TypeScript type checking.
- `bun run ios:setup`, `ios:build`, `ios:upload`, `ios:beta`: Fastlane-based iOS signing and release tasks.

## Coding Style & Naming Conventions

TypeScript is the default. `oxfmt` enforces tabs, `tabWidth: 4`, single quotes, semicolons, trailing commas, and a 100-character print width. Prefer lowercase kebab-case file names such as `transaction-row.tsx`; keep React components and exported types in PascalCase, functions and variables in camelCase, and route files aligned with Expo Router conventions like `app/(tabs)/summary.tsx`.

## Design & Accessibility

Preserve the app’s deliberate visual style: avoid generic fintech UI, card-heavy layouts, and decorative motion. The current theme and font stack are defined in `src/theme/colors.ts` and `tailwind.config.ts`; use those tokens instead of introducing new ad hoc colors or typography. Maintain strong contrast, large touch targets, and states that are distinguishable without relying on color alone.

## Testing Guidelines

Unit tests run with Bun for `src/db`, `src/store`, and `src/utils`. Component and screen tests run with Jest and React Native Testing Library. Name tests `*.test.ts` or `*.test.tsx` and keep them in nearby `__tests__/` folders. Add regression coverage for database changes, state transitions, and UI flows touched by the change.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits, for example `fix: ...`, `feat: ...`, and `chore(release): ...`. Keep commits focused and descriptive. Before opening a PR, run `bun run lint`, `bun run types`, and `bun run test`. PRs should explain the behavior change, link the relevant issue, and include screenshots or recordings for UI updates.

## Security & Release Notes

Do not commit signing secrets or alter iOS signing configuration casually. Certificates, provisioning profiles, and Fastlane flows are already wired into the repo; prefer the existing `ios:*` scripts instead of ad hoc release commands.
