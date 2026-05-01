# Architecture Overview

## Product Intent

Kopiika is an offline-first personal finance app for monthly planning versus reality. It is not a bank, accountant, or budget-enforcement tool. Simplicity, iteration speed, and tactile UX take priority over strict accounting rules.

## Core Domain Model

Everything is an entity. Money moves between entities through immutable transactions. Plans express intent; transactions express reality.

Entity types:

- `income`
- `account`
- `category`
- `saving` — balance comes from all-time transactions (like accounts)

Key rules:

- Balances are derived, never stored.
- Overspending is allowed and must remain visible.
- Drag-and-drop is the primary interaction pattern.
- Money flows to savings through `account -> saving` transactions and out through `saving -> account` transactions.

## Data Architecture

Persistence uses SQLite through the code in `src/db/`. State management uses Zustand in `src/store/`.

The authoritative model is:

- `entities`: labels, type, row/position ordering, icon, optional palette color, currency, soft-delete state, `include_in_total`, `is_default` (pre-selects in transaction flows), and `is_investment`
- `plans`: static budgets/goals stored with `period='all-time'`; `period_start` records when the plan was created
- `transactions`: immutable money movements between entities (including savings reservations); optional `series_id` links to a recurrence template; `is_confirmed` gates whether future-dated/past-due scheduled transactions are applied to balances; `notification_id` stores the scheduled local reminder id when reminders are enabled
- `market_value_snapshots`: optional manual valuation history for investment accounts; purchased price still comes from transactions, while market value comes from the latest snapshot
- `recurrence_templates`: rules for recurring transactions — amount, currency, entity pair, frequency (daily/weekly/monthly/yearly), start date, optional end date/count, generation horizon, and exclusions for skipped occurrences

Derived values belong in selectors, not persisted state:

- balances
- planned vs actual
- remaining amounts
- overspending state
- per-account savings reservation amounts (derived from net `account <-> saving` transaction flow)

Time scope rules:

- `income` and `category` actuals are evaluated against the current month
- `account` balances use all-time transactions; `reserved` is the net flow from account to savings
- investment accounts still derive purchased price from all-time transaction flow; market value is derived from the latest saved snapshot and is displayed separately from purchased price
- dashboard balance totals exclude accounts with `include_in_total=false` and investment accounts
- `saving` balances use all-time transactions (net inflow from accounts)

## Main Screen Behavior

The primary screen shows:

- `Income` for current-month inflow
- `Accounts · Total` for all-time balances (primary: available; secondary: total when reserved > 0)
- `Categories` for current-month spending
- `Savings · Goal` for all-time progress (balance = net transaction inflow)

Each item should present name, icon, actual amount, and progress. Accounts show available balance as primary and total as secondary. Other entity types show actual and planned. Negative remaining amounts are emphasized rather than hidden.

Account-specific behavior:

- `include_in_total=false` accounts remain visible but are excluded from the dashboard balance aggregate.
- Investment accounts show purchased price from transaction flow as the primary amount and latest market value as the secondary amount when a snapshot exists.
- Only one account can have `is_default=true`; quick-add and transaction flows use it as the initial account when the selected transaction type allows it.

## Summary and History

The Summary tab uses the same derived balance path as the dashboard. Categories and savings are sorted by actual amount for the selected period. Categories include a tappable allocation pie chart plus 3-prior-month sparklines; tapping a row or chart slice opens History filtered to that entity and period.

The History tab applies period, entity, and search filters consistently across confirmed, upcoming, and past-due unconfirmed transactions. It shows:

- `Upcoming` for future-dated transactions in the selected period
- `Needs Confirmation` for past-due unconfirmed transactions, with per-row confirm and bulk confirm actions
- confirmed transactions grouped by day
- period totals and entity-specific inflow/outflow totals
- reservation summaries when filtered to an account or saving
- market value snapshot history when filtered to an investment account

## Transaction Rules

Allowed transaction pairs are defined once in `src/utils/transaction-validation.ts` (`ALLOWED_COMBINATIONS`). Interactive entry points — drag-and-drop, quick add, edit, and split — use those helpers so picker filtering and drop handling stay aligned. CSV import validates structure and entity references, then preserves imported historical rows as supplied.

| From \ To | Income | Account | Category | Saving |
| --------- | ------ | ------- | -------- | ------ |
| Income    |        | ✅      |          |        |
| Account   |        | ✅      | ✅       | ✅     |
| Category  |        | ✅      |          |        |
| Saving    |        | ✅      |          |        |

Drag-and-drop also allows reverse pairs (e.g. category→account) to trigger refund flows.

## Interaction Rules

Dragging one entity onto another opens a transaction modal — except `Account -> Saving`, which opens a reservation modal (additive UX where the entered amount is added on top of the existing balance). Reverse drags (e.g. `Category -> Account`, `Account -> Income`) open the refund picker.

Behavioral expectations:

- `Account -> Category`: empty amount field; optional "fund from savings" section (below note) lets the user release savings to fund the transaction — creates explicit `saving -> account` release transactions
- `Account -> Saving`: opens the reservation modal with an empty amount field; the entered amount is added on top of the existing savings balance
- `Saving -> Account`: opens the transaction modal for explicit release
- `Income -> Account`: suggest remaining planned income
- `Category -> Account`: opens refund picker (reverse of account → category)
- `Account -> Income`: opens refund picker (reverse of income → account)
- No validation should block a transaction solely because it exceeds a plan

### Savings Reservations

Savings reservations are tracked through `account <-> saving` transactions — there is no separate reservations table. The net amount reserved from a specific account to a specific saving is derived by summing all transactions between that pair.

- Creating/adding: drag an account onto a saving to open the reservation modal. The user enters the amount to add; the system creates a transaction for that amount.
- Viewing from entity detail: saving edit shows a "Reserved from" section listing all accounts with net positive reservation amounts; account edit shows a "Reserved for" section listing all savings with net positive reservation amounts. Tapping a row opens the reservation modal for that account–saving pair.
- Reservation breakdowns can render as allocation charts where several accounts/savings participate.
- Releasing: when creating a transaction from an account, the "fund from savings" section (below the note field) shows existing reservations as checkboxes. Checking a reservation creates a `saving -> account` release transaction for the funded amount. The main transaction total stays as entered.
- History: all savings transactions appear in the History tab, filterable by entity and with editable amounts. When History is filtered to one account or saving, the list starts with a collapsible all-time net reservation summary for that entity, independent of the visible period/search-filtered chronological rows.

## Investment Accounts

Investment mode is an account-only setting. Purchased price remains the all-time account balance derived from transactions; manually entered market value snapshots are stored separately and never rewrite transaction history.

- Create/edit account forms can toggle investment mode.
- Account edit can save a market value snapshot dated today.
- History, when filtered to an investment account, lists snapshots newest first and lets the user edit or delete each snapshot.
- Turning off investment mode asks for confirmation and deletes that account's snapshots.
- Investment accounts are excluded from the dashboard balance aggregate so fluctuating market value does not mix with spendable account balances.

## Visual and Accessibility Principles

The app should feel deliberate, calm, and human. Avoid generic fintech UI, excessive cards, purple-on-white gradients, and decorative motion.

Use the configured theme tokens in [src/theme/colors.ts](../src/theme/colors.ts) and font stack in [tailwind.config.ts](../tailwind.config.ts). Maintain:

- WCAG AA contrast
- large tap targets
- clear hierarchy through type and spacing
- states that do not rely on color alone

## Explicit Non-Goals

Avoid adding these without a clear product decision:

- authentication
- cloud sync
- budget enforcement
- multi-period planning UI

## Recurrence and Series

Recurring transactions are template-driven. A `recurrence_template` stores the rule (frequency, amount, entity pair) and a generation horizon (how many days ahead to pre-generate). On app init, a backfill pass extends the horizon by creating real transaction rows linked via `series_id`.

Series scope rules:

- **Edit/delete single**: modifies or soft-deletes one occurrence; adds its timestamp to the template's exclusion list
- **Edit/delete all future**: updates the template itself and regenerates from the current date forward; past occurrences are untouched
- **Month-end handling**: monthly recurrences on the 29th–31st clamp to the last day of shorter months (Feb 28/29, Apr 30, etc.)
- **First occurrence**: occurrences dated today or earlier are confirmed immediately; future occurrences start unconfirmed

## Transaction Confirmation

Future-dated and recurring transactions use an `is_confirmed` boolean column (default `true`). Transactions created with a future timestamp are set to `is_confirmed = false`. They remain excluded from actual balances until the user confirms them.

Three transaction states:

- **Upcoming**: `timestamp > now` — counted in `upcoming` balance only
- **Needs confirmation**: `timestamp <= now` AND `is_confirmed = false` — excluded from `actual`, shown in a dedicated "Needs Confirmation" section in History
- **Confirmed**: `timestamp <= now` AND `is_confirmed = true` — counted in `actual` balance

Recurring transactions generated via backfill always start as `is_confirmed = false`. The History tab provides per-transaction "Confirm" buttons and a bulk "Confirm All" action.

## Local Reminders

Transaction reminders are opt-in and local-only. When enabled from Settings, the app requests notification permission, schedules native local notifications for future unconfirmed transactions, updates the History tab badge for past-due unconfirmed transactions, and registers a background catch-up task.

Reminder rules:

- Settings is the user-owned control point; reminders default to off.
- Scheduled notification ids are stored on transactions so confirm/delete/series edits can cancel them.
- Disabling reminders cancels scheduled notifications, clears the badge, unregisters the background task, clears reminder ids from SQLite and Zustand, and clears the background dedupe key.
- The background task updates badge count and can send one immediate summary notification for a changed set of overdue transactions.

## Data Portability

Settings provides CSV export/import for entities, plans, transactions, and market value snapshots. Import replaces all app data atomically: old rows are deleted and new rows inserted inside a SQLite transaction, so a failed import should leave the previous database intact.

## Completed Linear Scope

As of 2026-05-01, Linear has no open Todo, In Progress, or Backlog issues for the `kopiika` team. The docs should now describe the finished current state; planning docs under `docs/superpowers/` and dated review notes are historical unless they say otherwise.

## Possible Future Ideas

Ideas that are not committed product scope:

- savings projected finish date
- per-entity notes
