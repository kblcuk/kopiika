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
	'order',
	'row',
	'position',
	'include_in_total',
	'is_deleted',
	'is_default',
	'is_investment',
] as const;

export const PLAN_HEADERS = [
	'id',
	'entity_id',
	'period',
	'period_start',
	'planned_amount',
] as const;

export const TRANSACTION_HEADERS = [
	'id',
	'from_entity_id',
	'to_entity_id',
	'amount',
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
	'amount',
	'currency',
	'note',
	'rule',
	'start_date',
	'end_date',
	'end_count',
	'horizon',
	'exclusions',
	'is_deleted',
	'created_at',
] as const;

export const MARKET_VALUE_SNAPSHOT_HEADERS = [
	'id',
	'entity_id',
	'amount',
	'currency',
	'date',
] as const;

// Columns deliberately excluded from CSV export. Each entry MUST
// have a comment explaining why — the csv-schema-coverage test
// reads this map to know which columns are intentionally absent.
export const EXPORT_EXCLUDED_COLUMNS: Record<string, readonly string[]> = {
	// notification_id is a per-device OS notification handle; it
	// is meaningless after re-import on another device.
	transactions: ['notification_id'],
};
