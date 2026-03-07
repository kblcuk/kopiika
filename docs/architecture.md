# Architecture Overview

## Product Intent

Kopiika is an offline-first personal finance app for monthly planning versus reality. It is not a bank, accountant, or budget-enforcement tool. Simplicity, iteration speed, and tactile UX take priority over strict accounting rules.

## Core Domain Model

Everything is an entity. Money moves between entities through immutable transactions. Plans express intent; transactions express reality.

Entity types:

- `income`
- `account`
- `category`
- `saving`

Key rules:

- Balances are derived, never stored.
- Overspending is allowed and must remain visible.
- Users can move money between any entities.
- Drag-and-drop is the primary interaction pattern.

## Data Architecture

Persistence uses SQLite through the code in `src/db/`. State management uses Zustand in `src/store/`.

The authoritative model is:

- `entities`: labels, type, ordering, icon, optional color
- `plans`: monthly budgets or all-time goals
- `transactions`: immutable money movements between entities

Derived values belong in selectors, not persisted state:

- balances
- planned vs actual
- remaining amounts
- overspending state

Time scope rules:

- `income` and `category` actuals are evaluated against the current month
- `account` and `saving` balances use all-time transactions

## Main Screen Behavior

The primary screen shows:

- `Income` for current-month inflow
- `Accounts · Total` for all-time balances
- `Categories` for current-month spending
- `Savings · Goal` for all-time progress

Each item should present name, icon, actual amount, planned amount, and progress. Negative remaining amounts are emphasized rather than hidden.

## Interaction Rules

Dragging one entity onto another opens a transaction modal.

Behavioral expectations:

- `Account -> Category`: start with an empty amount field
- `Account -> Saving`: allow an empty amount and optional planned-remaining shortcut
- `Income -> Account`: suggest remaining planned income
- No validation should block a transaction solely because it exceeds a plan

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
