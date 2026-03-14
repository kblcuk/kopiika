import type { Entity } from '@/src/types';
import { DEFAULT_CURRENCY } from '@/src/utils/format';

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
		currency: DEFAULT_CURRENCY,
		icon: 'refresh-cw',
		order: 0,
		row: 0,
		position: -1, // Negative position ensures it appears first if accidentally shown
		is_deleted: false,
	};
}
