# Kopiika

Offline-first personal finance app for monthly planning vs reality. Built with Expo, React Native, SQLite, and Zustand. Not a bank or budget enforcer — it tracks where money goes, keeps overspending visible, and stays out of the way.

<p align="center">
  <img src="screenshots/dashboard.png" width="19%" alt="Dashboard" />
  <img src="screenshots/transaction-split.png" width="19%" alt="Transaction with split" />
  <img src="screenshots/transaction-recurrence.png" width="19%" alt="Recurring transaction" />
  <img src="screenshots/summary.png" width="19%" alt="Summary" />
  <img src="screenshots/history.png" width="19%" alt="History" />
</p>

## Features

- **Drag-and-drop dashboard** — income, accounts, categories, and savings as interactive grids; drag one onto another to move money
- **Recurring transactions** — daily, weekly, monthly, or yearly schedules with series edit/delete ("this one" / "all future")
- **Split transactions** — divide a payment across multiple categories in one go
- **Refund flows** — reverse drags trigger refund picker to undo prior transactions
- **Savings reservations** — reserve money from accounts to savings goals; release reserved funds when spending
- **Investment accounts** — track purchased price from transactions and optional manual market value snapshots
- **Allocation charts** — category spending and reservation breakdowns use tappable pie charts
- **Expression input** — type `100+50` or `200/2` in any amount field
- **Summary with sparklines** — per-entity planned vs actual, 4-month trend, period picker
- **Transaction history** — grouped by day, full-text search, entity filter, inline editing
- **Scheduled transactions** — upcoming transactions visible in history before they land
- **Transaction reminders** — opt-in local notifications and History badge for past-due unconfirmed items
- **Default account** — pre-selects your main account in transaction flows
- **Custom entity colors** — choose icon background colors from a curated palette
- **Quick-add** — floating `+` button in the tab bar opens the transaction modal from anywhere
- **CSV import/export** — full data portability (entities, plans, transactions, market values), managed from Settings
- **In-app changelog** — "What's New" modal on app update
- **Accessibility** — WCAG AA contrast, large touch targets, no color-only indicators

## AI-Assisted Development

One of the goals of this project was to go all-in with AI-assisted development. I spec features — sometimes high-level product requirements, sometimes more detailed technical decisions (library choices, architectural approaches) — and let AI handle the implementation. The [AGENTS.md](AGENTS.md) file configures the AI workflow, and `docs/architecture.md` serves as the shared context that keeps both human and AI aligned on product intent and domain rules.

## Prerequisites

- [Bun](https://bun.sh/) — package manager, scripts, unit test runner
- [mise](https://mise.jdx.dev/) — manages tool versions (Java, Gradle, Ruby) and release tasks
- [Ruby](https://www.ruby-lang.org/) + Bundler — for Fastlane release lanes (installed via mise)
- Xcode (iOS) / Android SDK (Android) — for native builds

## Getting Started

```sh
# Install JS dependencies
bun install

# Install Ruby dependencies (for Fastlane / release tooling)
bundle install

# Install mise-managed tools (gradle, java, ruby, etc.)
mise install
# If you've never installed hk before (git hooks manager) -- do it
mise use -g hk
hk install --global --mise

# Start Expo dev server
bun run start

# Run on a specific platform
bun run ios
bun run android
bun run web
```

## Development Commands

| Command                     | What it does                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `bun run test`              | Run unit tests (Bun) + component/screen tests (Jest)                                  |
| `bun run test:unit`         | Unit tests only (`src/db`, `src/store`, `src/utils`, `src/services`, `src/constants`) |
| `bun run test:component`    | Component/screen tests only (Jest + RNTL)                                             |
| `bun run test:coverage`     | Collect coverage from both runners                                                    |
| `bun run build:e2e:ios`     | Build the iOS Detox binary                                                            |
| `bun run build:e2e:android` | Build the Android Detox binary                                                        |
| `bun run test:e2e:ios`      | Run the iOS Detox suite                                                               |
| `bun run test:e2e:android`  | Run the Android Detox suite                                                           |
| `bun run lint`              | Lint with oxlint                                                                      |
| `bun run fmt`               | fmt with oxfmt                                                                        |
| `bun run fmt:check`         | Check fmt without writing                                                             |
| `bun run types`             | TypeScript type check                                                                 |
| `bun run unused`            | Find unused exported code with knip                                                   |
| `bun run checks`            | Run lint, fmt check, types, and unused export checks                                  |

## Simulator Workflow

The native binary and the JS bundle are independent — Metro serves JS to a running app, so JS changes don't need a rebuild. Only native code, dependencies, or `app.json` changes require recompiling.

### Reset to a clean state

App state (SQLite DB + `app-prefs.json`) lives in the app sandbox, so uninstalling the app is enough to simulate a fresh install. No keychain entries to worry about today.

```sh
# iOS — remove the app from the booted simulator
xcrun simctl uninstall booted com.kblcuk.kopiika

# iOS — nuke the simulator entirely (all apps + settings)
xcrun simctl shutdown booted && xcrun simctl erase booted

# Android — uninstall, or just clear data without uninstalling
adb uninstall com.kblcuk.kopiika
adb shell pm clear com.kblcuk.kopiika
```

### Reinstall a pre-built app without rebuilding

Once `bun run ios` (or `bun run build:e2e:ios`) has produced a `.app`, you can install it on any booted simulator directly:

```sh
# Dev build (from `bun run ios`)
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/kopiika.app

# E2E build (from `bun run build:e2e:ios`)
xcrun simctl install booted ios/build/Build/Products/Release-iphonesimulator/kopiika.app

# Launch (Metro must be running for dev builds)
xcrun simctl launch booted com.kblcuk.kopiika
```

`booted` targets the currently-running simulator; replace with a UDID from `xcrun simctl list devices` to target a specific one. Dragging the `.app` folder onto the Simulator window does the same thing without the terminal.

For Android, `adb install -r android/app/build/outputs/apk/release/app-release.apk` installs the E2E build; `bun run android` rebuilds + deploys the dev build.

## Project Structure

```
app/              Expo Router screens + route-level tests
src/
  components/     Shared UI components
  db/             SQLite / Drizzle persistence
  store/          Zustand state management
  utils/          Business logic helpers
  theme/          Color tokens and theme config
assets/           Static assets (icons, splash, fonts)
docs/             Architecture and release documentation
fastlane/         iOS and Android release lanes
scripts/          Maintenance and build helper scripts
ios/ android/     Native Expo projects
```

## Testing

Use `bun run test` for the regular unit + component suite. Use Detox only for simulator/device behavior such as native gestures, lifecycle, persistence across relaunch, and platform quirks.

Full testing guidance: [docs/testing.md](docs/testing.md).

## Core Concepts

The domain model has four entity types — **income**, **account**, **category**, and **saving** — connected by immutable **transactions**. Balances are always derived, never stored. Savings reservations are tracked as `account <-> saving` transactions. Recurring transactions are managed through **recurrence templates** that pre-generate future occurrences. Investment account market values live in separate snapshots, while purchased price still comes from transaction flow. Drag-and-drop is the primary interaction.

Full domain rules and data architecture: [docs/architecture.md](docs/architecture.md).

## Releasing

Release tooling is split between two runners:

- **`bun run ...`** — version bumps, changelog generation, app-level scripts
- **`mise run ...`** — signing, store uploads, build-number sync, multi-platform orchestration

Quick release flow:

```sh
mise run release:doctor       # Preflight checks (iOS + Android credentials)
bun run release               # Bump version, sync build numbers, update changelog
mise run release:beta         # Ship iOS + Android betas, notify Telegram
```

Full release guide: [docs/RELEASING.md](docs/RELEASING.md).

## Documentation

| Document                                             | Content                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                               | AI agent workflow, commands, coding conventions, testing guidelines |
| [docs/architecture.md](docs/architecture.md)         | Product intent, domain model, data architecture, interaction rules  |
| [docs/testing.md](docs/testing.md)                   | Test layers, placement, guardrails, and E2E decision flow           |
| [docs/RELEASING.md](docs/RELEASING.md)               | Release flow, signing, store uploads, build cleanup, secrets        |
| [e2e/CLAUDE.md](e2e/CLAUDE.md)                       | Detox testing level matrix, helpers, device notes, and commands     |
| [docs/privacy-policy.html](docs/privacy-policy.html) | Published privacy policy source                                     |
| [CHANGELOG.md](CHANGELOG.md)                         | Auto-generated release notes from conventional commits              |

## Tech Stack

- [Expo](https://expo.dev/) (SDK 55) + [Expo Router](https://docs.expo.dev/router/introduction/) — framework and file-based navigation
- [React Native](https://reactnative.dev/) 0.83 — cross-platform UI
- [SQLite](https://www.sqlite.org/) via [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) + [Drizzle ORM](https://orm.drizzle.team/) — local persistence
- [Zustand](https://zustand.docs.pmnd.rs/) — state management
- [NativeWind](https://www.nativewind.dev/) + [Tailwind CSS](https://tailwindcss.com/) — styling
- [Bun](https://bun.sh/) — package manager, scripts, unit tests
- [Jest](https://jestjs.io/) + [React Native Testing Library](https://callstack.github.io/react-native-testing-library/) — component/screen tests
- [Fastlane](https://fastlane.tools/) + [mise](https://mise.jdx.dev/) — release automation

## License

[GNU Affero General Public License v3.0](LICENSE)
