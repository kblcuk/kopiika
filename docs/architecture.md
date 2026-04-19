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

- `entities`: labels, type, ordering, icon, optional color, currency, `is_default` flag (pre-selects in transaction flows)
- `plans`: static budgets/goals stored with `period='all-time'`; `period_start` records when the plan was created
- `transactions`: immutable money movements between entities (including savings reservations); optional `series_id` FK links to a recurrence template
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
- `saving` balances use all-time transactions (net inflow from accounts)

## Main Screen Behavior

The primary screen shows:

- `Income` for current-month inflow
- `Accounts · Total` for all-time balances (primary: available; secondary: total when reserved > 0)
- `Categories` for current-month spending
- `Savings · Goal` for all-time progress (balance = net transaction inflow)

Each item should present name, icon, actual amount, and progress. Accounts show available balance as primary and total as secondary. Other entity types show actual and planned. Negative remaining amounts are emphasized rather than hidden.

## Transaction Rules

Allowed transaction pairs are defined once in `src/utils/transaction-validation.ts` (`ALLOWED_COMBINATIONS`). Every entry point — drag-and-drop, quick add, edit, split, and import — must validate against the same rules.

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
- Viewing from saving detail: the saving entity's edit modal shows a "Reserved from" section listing all accounts with net positive reservation amounts. Tapping a row opens the reservation modal for that account–saving pair.
- Releasing: when creating a transaction from an account, the "fund from savings" section (below the note field) shows existing reservations as checkboxes. Checking a reservation creates a `saving -> account` release transaction for the funded amount. The main transaction total stays as entered.
- History: all savings transactions appear in the History tab, filterable by entity and with editable amounts.

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

## Near-Term Backlog

Useful follow-ups once core flows remain stable:

- savings projected finish date
- entity color picker
- per-entity notes
