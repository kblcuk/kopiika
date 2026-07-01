// Per-table CSV export headers, kept in drizzle column order.
// Add new columns here when extending the schema; the
// csv-schema-coverage test enforces that every drizzle column
// (except EXPORT_EXCLUDED_COLUMNS) appears here.

export const ENTITY_HEADERS = [
	'id',
	'type',
	'name',
	'currency',
	'icon',
	'color',
	'row',
	'position',
	'include_in_total',
	'is_deleted',
	'is_default',
	'is_investment',
] as const;

// KII-120: `planned_amount_minor` is an integer minor-unit value (cents for
// EUR). Old CSV exports used `planned_amount` as a float; this is a clean
// break — pre-launch, so no compat layer.
export const PLAN_HEADERS = [
	'id',
	'entity_id',
	'period',
	'period_start',
	'planned_amount_minor',
] as const;

// `is_confirmed` is exported as `"true"` / `"false"` but is treated as
// optional on import: a missing column or empty cell falls back to
// `defaultIsConfirmed(timestamp)` (past → confirmed, future → unconfirmed).
// This keeps hand-edited / third-party CSVs from silently marking
// future-dated rows as confirmed.
export const TRANSACTION_HEADERS = [
	'id',
	'from_entity_id',
	'to_entity_id',
	'amount_minor',
	'currency',
	'timestamp',
	'note',
	'series_id',
	'is_confirmed',
] as const;

export const RECURRENCE_TEMPLATE_HEADERS = [
	'id',
	'from_entity_id',
	'to_entity_id',
	'amount_minor',
	'currency',
	'note',
	'rule',
	'start_date',
	'end_date',
	'end_count',
	'is_deleted',
	'created_at',
] as const;

// KII-123: Exclusions live in their own table now. Each row is one skipped
// occurrence for a given template. Old CSV exports embedded these as a JSON
// array in `recurrence_templates.exclusions`; the importer still accepts that
// shape for back-compat (see `parseRecurrenceTemplates`).
export const RECURRENCE_EXCLUSION_HEADERS = ['template_id', 'timestamp'] as const;

export const MARKET_VALUE_SNAPSHOT_HEADERS = [
	'id',
	'entity_id',
	'amount_minor',
	'currency',
	'date',
] as const;

// Columns deliberately excluded from CSV export. Each entry MUST
// have a comment explaining why — the csv-schema-coverage test
// reads this map to know which columns are intentionally absent.
//
// `created_at` / `updated_at` (KII-126) are device-local write-time
// metadata used by household sync (KII-96). CSV is the offline-backup
// channel — sync travels via the encrypted op-log, not CSV — so we don't
// round-trip these columns. On import, `replaceAllData` stamps fresh
// values via `?? Date.now()`. Re-evaluate if/when CSV becomes a
// cross-device transfer mechanism. The existing `recurrence_templates.
// created_at` is kept exported (it's app-supplied scheduling metadata,
// not the sync-style write-time stamp).
export const EXPORT_EXCLUDED_COLUMNS: Record<string, readonly string[]> = {
	// notification_id is a per-device OS notification handle; it
	// is meaningless after re-import on another device.
	transactions: ['notification_id', 'created_at', 'updated_at'],
	entities: ['created_at', 'updated_at'],
	plans: ['created_at', 'updated_at'],
	recurrence_templates: ['updated_at'],
	// `recurrence_exclusions` has no write-time columns to exclude — both
	// `template_id` and `timestamp` are part of the composite PK and round-trip.
	recurrence_exclusions: [],
	market_value_snapshots: ['created_at', 'updated_at'],
};
