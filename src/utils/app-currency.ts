import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { Entity } from '@/src/types';
import { DEFAULT_CURRENCY } from './format';

/**
 * The app's single currency (KII-155).
 *
 * Truth lives in the row data, not in a setting: `currency` is a shared field
 * (docs/sync-design.md), every row carries it, and all rows agree by
 * construction — so a second device reads the same answer off the same rows
 * without syncing a preference. The pref is only a seed for the window before
 * any user entity exists (fresh install, onboarding, post-reset).
 *
 * The balance-adjustment system entity is excluded deliberately: it is
 * re-created as DEFAULT_CURRENCY on any hydration where it is missing, so
 * after a data reset it can predate every user entity and would otherwise drag
 * the whole app back to EUR.
 */
export function resolveAppCurrency(entities: Entity[], pref: string | null): string {
	const user = entities.find((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID && !e.is_deleted);
	return user?.currency ?? pref ?? DEFAULT_CURRENCY;
}
