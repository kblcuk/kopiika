# E2E Testing Guidelines (Detox + Jest)

## Philosophy

E2E tests cover **user journeys**, not implementation details. Each test should read like a real user scenario: open the app, do something, verify what the user would see.

**Do not change application code to make tests pass.** Tests must work against exactly what a real user gets. The only permitted exceptions are:
- Adding `testID` props to components (maximum one `testID` per interactive/observable element, no logic changes)
- Using `seedFixture` to pre-populate the database (replaces manual UI setup, not business logic)

If a flow cannot be tested without changing app behaviour, the test design is wrong — reconsider the approach.

## Before Writing Tests

Before writing any test, read the relevant application source files (`src/components/`, `app/`) to understand the actual UI structure. Then:

1. Identify every element that needs to be tapped, typed into, scrolled, or read.
2. Check which of those already have a `testID` in `test-ids.ts`.
3. **Propose a list of `testID`s that need to be added** to components before test code can be written.
4. Wait for confirmation, add the `testID` props to the components and entries to `test-ids.ts`, then write the tests.

This prevents writing tests against IDs that don't exist yet and avoids back-and-forth rebuild cycles.

## Build & Run Commands

### Building (required after native/JS changes that affect the binary)

```bash
# iOS
bun run build:e2e:ios

# Android
bun run build:e2e:android
```

Builds compile with `EXPO_PUBLIC_E2E=true` (enables the fixture deep-link route).

**When to rebuild:** after changing native code, adding dependencies, or modifying anything that affects the installed binary. Pure test file changes (`e2e/*.ts`) do not require a rebuild.

**After making changes that require a rebuild, trigger it in the background** so the binary is ready when tests need to run:

```bash
# Run in background — you will be notified when done
bun run build:e2e:ios   # or android
```

### Running Tests

```bash
# Full suite — iOS
bun run test:e2e:ios

# Full suite — Android
bun run test:e2e:android

# Single test file — iOS
bunx detox test --configuration ios.sim.debug e2e/transactions.test.ts

# Single test file — Android
bunx detox test --configuration android.emu.debug e2e/transactions.test.ts

# Single test by name (substring match) — iOS
bunx detox test --configuration ios.sim.debug -t "Account → Category"

# Single test by name — Android
bunx detox test --configuration android.emu.debug -t "Account → Category"
```

Devices: iOS uses **iPhone 17 Pro Max** simulator; Android uses **Pixel_9a** AVD.

## Stack & Entry Points

- Framework: **Detox** with **Jest** runner (`e2e/jest.config.js`)
- All test files live in `e2e/` and match `*.test.ts`
- Test IDs are centralised in `e2e/test-ids.ts` — always import from there, never hardcode strings
- Fixture seeding: `e2e/fixture.ts` → `seedFixture([...])` — seeds SQLite via the deep-link route `kopiika://e2e/fixture`
- Animation shim: `e2e/animationSetup.ts` re-enables Android animations after each `launchApp` so gestures are visible — registered via `setupFiles` in `jest.config.js`, runs automatically

## TestIDs

- **Never** hardcode `testID` strings in test files. Add new IDs to `test-ids.ts` first, then import `TestIDs`.
- Use the helper functions for dynamic IDs: `TestIDs.entityBubble(name)`, `TestIDs.entityOption(name)`, `TestIDs.entityAmount(name)`, `TestIDs.splitRow(index)`, etc.
- When you add a new `testID` to a component, add the corresponding entry to `test-ids.ts` in the same PR.

## File & Test Structure

- One `describe` block per feature/screen per file (e.g. `describe('Transactions', ...)`).
- Group related tests with comment banners: `// ── Via [+] ─────`, `// ── Via DnD ─────`, `// ── Blocked ─────`.
- Keep helper functions above the `describe` block, not inside it.
- Name tests in the format: `[method] Subject: expected outcome` — e.g. `[+] Account → Category: category actual increases, account decreases`.

## Setup & Teardown

```ts
beforeAll(async () => {
    await device.launchApp({ delete: true }); // fresh install once per suite
    await device.disableSynchronization();     // sync off for the entire suite
    await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(15000);
    await dismissWhatsNewIfPresent();
});

beforeEach(async () => {
    try {
        await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(200);
    } catch {
        // Not on home screen (e.g. modal left open) — relaunch to reset
        await device.launchApp({ newInstance: true });
        await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(10000);
    }
});
```

- Use `delete: true` in `beforeAll` for a clean install. **Do not** relaunch the app between every test — relaunches are expensive (~8-15 s each). Instead, `beforeEach` checks whether the home screen is already visible and relaunches only when the previous test left a modal or overlay open.
- Always wait for `TestIDs.homeScreen` to be visible before proceeding.
- Call `dismissWhatsNewIfPresent()` in `beforeAll` only — it uses a short timeout and swallows errors if the modal is absent.
- Because tests share a single app process, all amount assertions must use **deltas** (before/after), never absolute values.

## Detox Synchronization

Detox auto-waits for the app to become idle before each interaction (`waitFor`, `tap`, etc.). When the app has **continuous background work** — animations, timers, pending layout — sync never settles, and `waitFor` hangs until its timeout expires.

This app's home screen has continuous layout work from entity bubbles and amount animations. Detox sync never settles — it reports "The app is busy with the following tasks: layers needs layout, views needs layout, N work items pending on Main Queue". This means **sync is disabled globally** for the entire test suite in `beforeAll`.

**Consequences of sync being off:**
- `waitFor` uses pure polling instead of waiting for idle — you **must** provide explicit `withTimeout()` on every `waitFor` call.
- Never `await element(...).tap()` without a preceding `waitFor(...).toBeVisible().withTimeout(N)` — there is no auto-wait to catch you.
- `setTimeout` delays (e.g. 500 ms for pageSheet animations) remain necessary — without sync, Detox cannot detect when an animation finishes.

**How to tell if sync is the problem:** if a test hangs and Detox logs "The app is busy with the following tasks", the app has continuous work preventing sync from settling. The fix is to keep sync off (already done at suite level) and use explicit `waitFor` timeouts.

## Waiting & Timeouts

- Always use `waitFor(...).toBeVisible().withTimeout(N)` before interacting with any element that may animate in.
- Standard timeouts: **5000 ms** for modals/pickers, **10000 ms** for app launch, **15000 ms** for fresh install.
- Never `await element(...).tap()` without a preceding `waitFor` unless the element is guaranteed to be on screen.

## Assertions

- Use `jestExpect` (imported from `@jest/globals`) for value assertions — not Detox `expect`.
- For amounts use `toBeCloseTo(value, 2)` — amounts can have floating-point drift and locale-specific separators.
- Assert **deltas**, not absolute values: read `before` snapshot, perform action, check `before ± delta`.

```ts
const before = await getAmount('Groceries');
await createTransaction('Main Card', 'Groceries', '43.21');
jestExpect(await getAmount('Groceries')).toBeCloseTo(before + 43.21, 2);
```

## Seeding State with `seedFixture`

Use `seedFixture` when a test needs pre-existing transactions (e.g. refund flows):

```ts
await seedFixture([{ from: 'Main Card', to: 'Groceries', amount: 55.00 }]);
```

- `seedFixture` navigates away and back — wait for `homeScreen` is already handled inside it.
- Only available in `EXPO_PUBLIC_E2E=true` builds.

## DnD (Drag-and-Drop) Gestures

- Use `longPressAndDrag` with hold **600 ms**, speed `'slow'`, and hold-after-reach **300 ms**.
- On Android, scroll down 150 px before a DnD to avoid triggering the notification shade:

```ts
if (device.getPlatform() === 'android') {
    await element(by.id(TestIDs.homeScrollView)).scroll(150, 'down');
}
```

- The generic `dnd(fromName, toName)` helper always scrolls (safe for both platforms) — use it for blocked-flow tests.
- Use `createTransactionViaDnD` for the happy path; it scrolls conditionally and completes the transaction form.

## Platform Differences

### iOS — continuous layout events break Detox sync

The home screen entity bubbles trigger an infinite stream of layout passes on iOS ("layers needs layout", "views needs layout"). Detox sync never settles, so every `waitFor` hangs until timeout. **This is why sync is disabled globally** via `device.disableSynchronization()` in `beforeAll` — see the Detox Synchronization section above.

### Android — animations disabled by Detox, then re-enabled by us

Detox disables all system animations on Android at startup for test stability. DnD (`longPressAndDrag`) requires real animation timing to register the gesture — without animations the long-press threshold is never reached. `e2e/animationSetup.ts` wraps `device.launchApp` to re-enable all three animation scales via `adb` immediately after each launch. This file must stay in `setupFiles` in `jest.config.js`.

### Android — scroll before DnD to avoid notification shade

A drag starting near the top edge of the screen on Android opens the notification shade. Always scroll down 150 px before any DnD gesture on Android (already built into the `dnd()` and `createTransactionViaDnD()` helpers).

### `getAttributes()` return type

`getAttributes()` returns a platform-specific object. Always cast explicitly — the `text` field is the only one we rely on:

```ts
const attrs = (await element(by.id(...)).getAttributes()) as { text: string };
```

### Decimal separators

Amount text varies by device locale: some return `"43.21"`, others `"43,21"`. `getAmount()` normalises this with `.replace(',', '.')` before `parseFloat`.

## Skipping Tests

- Use `it.skip` with a comment explaining why, not a deleted test.
- Example: `it.skip('DnD Income → Category: blocked ...', ...)` — flaky gesture detection on some simulators.

## Shared Helpers (reuse, don't duplicate)

| Helper | Purpose |
|---|---|
| `dismissWhatsNewIfPresent()` | Tap dismiss on the What's New modal if present |
| `getAmount(entityName)` | Read numeric amount from an entity bubble |
| `openIncomeSection()` | Tap income toggle and wait for Salary bubble |
| `expectNoTransactionModal()` | Assert transaction modal did NOT appear |
| `createTransaction(from, to, amount)` | Full [+] button happy path |
| `createTransactionViaDnD(from, to, amount)` | Full DnD happy path |
| `dnd(from, to)` | Raw DnD gesture without completing a form |

Add new helpers to the file they are first needed in; move to a shared `helpers.ts` only when used across multiple test files.

## Domain Rules to Know

- `income` entities: visible only when toggled via `TestIDs.incomeToggleButton`. The [+] picker reads from the store so income is *selectable* even when collapsed — but `getAmount('Salary')` will fail if the bubble is hidden.
- `savings` entities are backed by real `account <-> saving` transactions. DnD Account → Saving opens `reservation-submit-button`, while Saving → Account uses the regular transaction modal for releases.
- **Blocked pairs**: Income→Category and Category→Category — these must not open the transaction modal.
- Refund flows (Category→Account, Account→Income) open the refund picker (`TestIDs.refundPicker.close`).
