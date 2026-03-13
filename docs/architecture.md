# Architecture Overview

## Product Intent

Kopiika is an offline-first personal finance app for monthly planning versus reality. It is not a bank, accountant, or budget-enforcement tool. Simplicity, iteration speed, and tactile UX take priority over strict accounting rules.

## Core Domain Model

Everything is an entity. Money moves between entities through immutable transactions. Savings are virtual reservations of account money, not independent fund sources. Plans express intent; transactions express reality; reservations express earmarked funds.

Entity types:

- `income`
- `account`
- `category`
- `saving` — virtual: balance comes from reservations, not transactions

Key rules:

- Balances are derived, never stored.
- Overspending is allowed and must remain visible.
- Drag-and-drop is the primary interaction pattern.
- Savings cannot be a source or destination in transactions. Money flows to savings only through reservations.

## Data Architecture

Persistence uses SQLite through the code in `src/db/`. State management uses Zustand in `src/store/`.

The authoritative model is:

- `entities`: labels, type, ordering, icon, optional color
- `plans`: monthly budgets or all-time goals
- `transactions`: immutable money movements between entities
- `reservations`: earmarked account funds for savings goals (unique per account–saving pair)

Derived values belong in selectors, not persisted state:

- balances
- planned vs actual
- remaining amounts
- overspending state
- available balance (account actual minus reserved)

Time scope rules:

- `income` and `category` actuals are evaluated against the current month
- `account` balances use all-time transactions; `reserved` is the sum of reservations on that account
- `saving` balances are the sum of reservations pointing to that saving (not transactions)

## Main Screen Behavior

The primary screen shows:

- `Income` for current-month inflow
- `Accounts · Total` for all-time balances (primary: available; secondary: total when reserved > 0)
- `Categories` for current-month spending
- `Savings · Goal` for all-time progress (balance = sum of reservations)

Each item should present name, icon, actual amount, and progress. Accounts show available balance as primary and total as secondary. Other entity types show actual and planned. Negative remaining amounts are emphasized rather than hidden.

## Interaction Rules

Dragging one entity onto another opens a transaction modal — except `Account -> Saving`, which opens a reservation modal instead.

Behavioral expectations:

- `Account -> Category`: empty amount field; optional "fund from savings" section lets the user release reserved money into the transaction total
- `Account -> Saving`: opens the reservation modal to set/update the earmarked amount (no transaction created)
- `Income -> Account`: suggest remaining planned income
- No validation should block a transaction solely because it exceeds a plan
- Savings cannot be dragged as a transaction source; outgoing transactions from savings are structurally blocked

### Reservations

A reservation earmarks a portion of an account's balance for a savings goal. The `reservations` table enforces a unique `(account_entity_id, saving_entity_id)` pair — one reservation per account–saving combination.

- Creating/updating: drag an account onto a saving, or edit the amount in the reservation modal.
- Viewing/editing from saving detail: the saving entity's edit modal shows a "Reserved from" section listing all accounts with reservations for that saving. Tapping a row opens the reservation modal for that account–saving pair.
- Releasing: when creating a transaction from an account, the "fund from savings" section shows existing reservations as checkboxes. Checked amounts are added to the transaction total and the reservation is reduced (or deleted if fully released).
- Deletion: setting amount to 0 deletes the row. FK `ON DELETE CASCADE` cleans up when either entity is deleted. CSV import clears all reservations.

## Visual and Accessibility Principles

The app should feel deliberate, calm, and human. Avoid generic fintech UI, excessive cards, purple-on-white gradients, and decorative motion.

Use the configured theme tokens in [src/theme/colors.ts](/Users/alex/Code/kopiika/src/theme/colors.ts) and font stack in [tailwind.config.ts](/Users/alex/Code/kopiika/tailwind.config.ts). Maintain:

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

## Near-Term Backlog

Useful follow-ups once core flows remain stable:

- transaction text search in History
- savings projected finish date
- entity color picker
- per-entity notes
