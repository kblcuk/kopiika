# Testing

Kopiika's tests should protect product behavior and domain rules with the cheapest layer that fully exercises the risk. Prefer fast deterministic coverage for pure rules, and reserve Detox for behavior that only a simulator or device can prove.

## Test Layers

| Layer                       | Use for                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun unit tests              | SQLite helpers, store transitions, selectors, import/export parsing, recurrence, reservation math, validation rules, formatting, notification logic, app prefs                                |
| Jest component/screen tests | Route screens and React Native component behavior, including transaction modal flows, entity editing, reservations, allocation charts, History, Summary, Settings, and the "What's New" modal |
| Detox E2E tests             | Device-only journeys: launch, quick-add, drag-and-drop, refund picker, reservation flow, blocked drag, persistence across relaunch, and History edit/delete                                   |

See [../README.md](../README.md#development-commands) for the commands that run each layer.

## Placement

- Put Bun tests near the code they cover in `src/**/__tests__/*.test.ts`.
- Put component tests in nearby `src/components/__tests__/*.test.tsx` folders.
- Put route-level tests in `app/**/__tests__/*.test.tsx`.
- Put Detox specs in `e2e/tests/*.test.ts`.
- Keep shared Detox helpers and test IDs in `e2e/support/`.

## Choosing A Layer

1. If behavior is a pure function, write a unit test.
2. If behavior depends on store or database state, write a store/db test.
3. If behavior depends on rendered React components but not native gestures or app lifecycle, write a component or screen test.
4. If behavior requires native gestures, native modal timing, cross-screen app lifecycle, persistence across relaunch, platform quirks, or deep-link fixture seeding, use Detox.

Do not add E2E tests for validation matrices, picker filtering, balance math, modal state, or simple rendering. Those belong lower in the stack.

## Guardrails

- Test behavior and domain rules before exact classes, view props, internal call counts, or prop plumbing.
- Keep regression coverage for balances, reservations, overspending visibility, History filters, import validation, recurrence, confirmation, reminders, and release-sensitive flows.
- Add a focused regression test when fixing a bug if the behavior can be exercised reasonably.
- Keep E2E coverage small and high-signal. Prefer one representative journey over repeating every entity-type combination.

## E2E Details

Read [../e2e/CLAUDE.md](../e2e/CLAUDE.md) before adding or changing Detox tests. It contains the full testing-level matrix, test ID rules, fixture seeding details, synchronization notes, device configuration, platform-specific drag guidance, the delta-vs-absolute-amount rule for shared sessions, and single-file / single-test commands (including the `mise run e2e:ios` wrapper).
