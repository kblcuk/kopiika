import type { Entity } from '@/src/types';

/**
 * System entity ID for balance adjustments.
 * This entity is hidden from the UI and used to record balance corrections.
 */
export const BALANCE_ADJUSTMENT_ENTITY_ID = '__system_balance_adjustment__';

/**
 * Creates the balance adjustment system entity.
 * This entity is used as the source/destination for balance correction
 * transactions.
 *
 * `currency` is required (KII-155): this row is re-created on any hydration
 * where it is missing, so defaulting it to EUR would reintroduce a stale
 * EUR row into a board the user has set to something else.
 */
export function createBalanceAdjustmentEntity(currency: string): Entity {
	return {
		id: BALANCE_ADJUSTMENT_ENTITY_ID,
		type: 'account',
		name: 'Balance Adjustments',
		currency,
		icon: 'refresh-cw',
		row: 0,
		position: -1, // Negative position ensures it appears first if accidentally shown
		is_deleted: false,
	};
}
