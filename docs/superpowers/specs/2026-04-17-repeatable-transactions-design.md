# KII-66: Repeatable Transactions

Repeatable transactions let users schedule recurring financial entries (daily, weekly, monthly, yearly) that are pre-generated as real transaction rows up to a configurable horizon.

## Scope

- Recurrence creation, generation, and series management only.
- **Out of scope:** Confirmation flow for future-dated transactions (KII-65), advanced filters/management screens, complex custom recurrence patterns (deferred to future work).

## Data Model

### New table: `recurrence_templates`

| Column           | Type                   | Description                                                                                                               |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`             | text PK                | UUID                                                                                                                      |
| `from_entity_id` | text FK → entities.id  | Source entity                                                                                                             |
| `to_entity_id`   | text FK → entities.id  | Target entity                                                                                                             |
| `amount`         | real                   | Transaction amount                                                                                                        |
| `currency`       | text                   | Currency code                                                                                                             |
| `note`           | text, nullable         | Optional note                                                                                                             |
| `rule`           | text                   | JSON recurrence rule (see below)                                                                                          |
| `start_date`     | integer                | Timestamp of first occurrence                                                                                             |
| `end_date`       | integer, nullable      | Stop generating after this date. Null = indefinite                                                                        |
| `end_count`      | integer, nullable      | Stop after N occurrences. Null = indefinite. Both `end_date` and `end_count` can coexist; whichever is reached first wins |
| `horizon`        | integer                | How far ahead to generate, in days (30, 90, 180, 365)                                                                     |
| `exclusions`     | text, nullable         | JSON array of timestamps to skip (from "delete this one")                                                                 |
| `is_deleted`     | boolean, default false | Soft delete, consistent with entity pattern                                                                               |
| `created_at`     | integer                | Creation timestamp                                                                                                        |

Indices: `idx_recurrence_templates_deleted` on `is_deleted`.

### `rule` JSON format

Simple (MVP):

```json
{ "type": "daily" }
{ "type": "weekly" }
{ "type": "monthly" }
{ "type": "yearly" }
```

Future extensibility (no schema migration needed):

```json
{
	"type": "custom",
	"patterns": [
		{ "nth": 2, "day": "wednesday" },
		{ "nth": 3, "day": "friday" }
	]
}
```

Generation logic dispatches on `rule.type`. Simple types use built-in date math; `custom` would use a pattern matcher added later.

### Modified table: `transactions`

Add column:

| Column      | Type           | Description                                                       |
| ----------- | -------------- | ----------------------------------------------------------------- |
| `series_id` | text, nullable | FK → recurrence_templates.id. Null for non-recurring transactions |

Index: `idx_transactions_series` on `series_id`.

### Horizon options

Stored per-template. Presented as a dropdown during creation:

- 1 month
- 3 months (default)
- 6 months
- 1 year

## Occurrence Generation

### Pure function

`generateOccurrences(template) -> timestamp[]`

Takes a template's `rule`, `start_date`, `end_date`, `end_count`, `exclusions`, `horizon` (days) and returns an array of timestamps up to `min(end_date, now + horizon_days)`, respecting `end_count` and skipping `exclusions`.

### Date math

- `daily`: +1 calendar day
- `weekly`: +7 calendar days
- `monthly`: same day-of-month, clamped (e.g. Jan 31 -> Feb 28)
- `yearly`: same month+day, clamped for leap years
- All calculations in local time to avoid DST shifts

### When generation runs

1. **On template creation** — generate all occurrences from `start_date` to `min(end_date, now + horizon)`, insert as transaction rows with `series_id` set.
2. **On app open** (`initialize()` in Zustand store) — for each non-deleted template, compute expected timestamps, diff against existing transactions by `(series_id, timestamp)`, insert any missing ones.

### Idempotency

Backfill checks for existing rows by `(series_id, timestamp)` before inserting. Safe to run repeatedly. Edited transactions (amount/note changed by user for "this one only") are not overwritten because the row already exists at that timestamp.

## Series Management

### Editing a recurring transaction

User is presented with two options via action sheet:

| Action            | Behavior                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **This one only** | Update the transaction row in place. Keep `series_id`. Backfill skips it (row exists).                                                                                                                                                                                                                                                                                                |
| **All future**    | Update the template's fields (amount, entities, note, rule). If the rule/frequency changed, delete all future occurrences and regenerate from the selected transaction's date using the new rule. If only amount/entities/note changed, update all transactions where `series_id = X AND timestamp >= selected.timestamp` in place. Future backfill uses updated template either way. |

### Deleting a recurring transaction

| Action            | Behavior                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **This one only** | Delete the transaction row. Add its timestamp to template's `exclusions` array. Backfill won't regenerate.                                                                                                     |
| **All future**    | Delete all transactions where `series_id = X AND timestamp >= selected.timestamp`. Set template's `end_date` to the previous occurrence's timestamp, or set `is_deleted = true` if no past occurrences remain. |

### Entity deletion

When deleting an entity that is referenced by active recurrence templates:

- Prompt the user: "This entity is used in N recurring transaction series. Do you also want to delete future occurrences and stop the recurrence?"
- **Yes** — delete future transactions with matching `series_id`, set template `is_deleted = true`
- **No** — leave template and transactions as-is (they reference a soft-deleted entity, which the UI already handles)

No silent deactivation.

## UI Changes

### Transaction Modal (create mode)

New controls below the date picker:

1. **"Repeat" toggle** — off by default
2. When on:
    - **Frequency picker** — segmented control or dropdown: Daily / Weekly / Monthly / Yearly
    - **End condition** — "Never" (default) / "Until date" (date picker) / "After N times" (number input)
    - **Generate ahead** — dropdown: 1 month / 3 months / 6 months / 1 year

Past dates are allowed as `start_date` — enables backlogging transactions in bulk.

### Transaction Modal (edit mode)

- If the transaction has a `series_id`, show indicator: "Part of a recurring series"
- On save → action sheet: "This one only" / "All future"
- On delete → action sheet: "This one only" / "All future"

### Transaction Row

- Transactions with `series_id` display a small repeat icon next to the existing clock icon (for future-dated)

### History Tab

- No new filters or sections for MVP
- Recurring transactions appear in "Upcoming" (if future) or their day section (if past), same as non-recurring
- Repeat icon is the only visual distinction

## Zustand Store Changes

- Load `recurrence_templates` in `initialize()`, run backfill after loading
- New actions: `createRecurrenceTemplate()`, `updateRecurrenceTemplate()`, `deleteRecurrenceTemplate()`
- Modify `addTransaction()` to optionally accept recurrence config and create template + occurrences
- Modify `updateTransaction()` and `deleteTransaction()` to handle series operations (scope param: `"single"` | `"future"`)
- Modify `deleteEntity()` to check for active templates and prompt

## Database Migration

New migration adding:

1. `recurrence_templates` table
2. `series_id` column on `transactions` (nullable, no migration of existing data needed)
3. Index on `transactions.series_id`

## Testing

- `generateOccurrences()` — unit tests for each frequency, clamping, end conditions, exclusions
- Backfill idempotency — running twice produces no duplicates
- Series edit/delete — "this one" vs "all future" correctness
- Entity deletion prompt — template deactivation when user confirms
- Transaction modal — repeat toggle visibility, form validation
- History tab — repeat icon rendering for series transactions
