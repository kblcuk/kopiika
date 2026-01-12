import type { Entity } from '@/src/types';

/**
 * System entity ID for balance adjustments.
 * This entity is hidden from the UI and used to record balance corrections.
 */
export const BALANCE_ADJUSTMENT_ENTITY_ID = '__system_balance_adjustment__';

/**
 * Creates the balance adjustment system entity.
 * This entity is used as the source/destination for balance correction transactions.
 */
export function createBalanceAdjustmentEntity(): Entity {
	return {
		id: BALANCE_ADJUSTMENT_ENTITY_ID,
		type: 'account',
		name: 'Balance Adjustments',
		currency: 'EUR', // Default currency, actual adjustments use account's currency
		icon: 'refresh-cw',
		order: -1, // Negative order keeps it first if accidentally shown
	};
}
