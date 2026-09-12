/**
 * What the "+" tab button can add (KII-161).
 *
 * The button used to open one generic form that defaulted its source to the
 * default account, which quietly made every entry an expense unless you knew
 * to change the source. The mini-menu names the flows the form already
 * supports instead; a kind is nothing but a pair of type filters plus a seed,
 * so no new transaction semantics come with it — `QUICK_ADD_KINDS` is asserted
 * against `isAllowedPair` in the unit test.
 *
 * Kept free of React imports so it stays in Bun's unit-test scope: the menu
 * component owns the icon per kind, and the colour comes from `accentType`.
 */
import type { Entity, EntityType } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { isEntityActive } from './entity-display';
import { getValidToEntities } from './transaction-validation';

export type QuickAddKind = 'expense' | 'income' | 'transfer' | 'reserve';

export interface QuickAddKindSpec {
	key: QuickAddKind;
	label: string;
	/** Second line on the menu row — teaches the flow before the form opens. */
	hint: string;
	/** Narrows the source picker. */
	fromTypes: EntityType[];
	/** Narrows the destination picker. */
	toTypes: EntityType[];
	/**
	 * The side that makes this kind distinctive. The menu tints the row with
	 * that entity type's colour, so a row matches the bubbles it moves money
	 * between.
	 */
	accentType: EntityType;
}

export const QUICK_ADD_KINDS: QuickAddKindSpec[] = [
	{
		key: 'expense',
		label: 'Expense',
		hint: 'Account → category',
		fromTypes: ['account'],
		toTypes: ['category'],
		accentType: 'category',
	},
	{
		key: 'income',
		label: 'Income',
		hint: 'Income → account',
		fromTypes: ['income'],
		toTypes: ['account'],
		accentType: 'income',
	},
	{
		key: 'transfer',
		label: 'Transfer',
		hint: 'Between accounts',
		fromTypes: ['account'],
		toTypes: ['account'],
		accentType: 'account',
	},
	{
		key: 'reserve',
		label: 'Reserve',
		hint: 'Into a savings goal',
		fromTypes: ['account'],
		toTypes: ['saving'],
		accentType: 'saving',
	},
];

export function isQuickAddKind(value: unknown): value is QuickAddKind {
	return QUICK_ADD_KINDS.some((kind) => kind.key === value);
}

/**
 * Resolves a route param to a kind. Anything unrecognised degrades to
 * `expense` — the behaviour the "+" button had before the menu existed.
 */
export function getQuickAddKind(key: unknown): QuickAddKindSpec {
	const match = QUICK_ADD_KINDS.find((kind) => kind.key === key);
	return match ?? QUICK_ADD_KINDS[0]!;
}

/**
 * Whether the board can actually carry out this kind — some source of its own
 * type with somewhere allowed to send money. The menu dims the rows that fail,
 * rather than opening a form onto an empty picker with no explanation.
 *
 * Asked through `getValidToEntities` so the answer cannot drift from what the
 * destination picker will offer: currency, deletion, the system account and
 * self-transfers are all judged there.
 */
export function isQuickAddKindAvailable(kind: QuickAddKindSpec, entities: Entity[]): boolean {
	return entities.some(
		(source) =>
			kind.fromTypes.includes(source.type) &&
			isEntityActive(source) &&
			source.id !== BALANCE_ADJUSTMENT_ENTITY_ID &&
			getValidToEntities(entities, source, source.currency).some((target) =>
				kind.toTypes.includes(target.type)
			)
	);
}

export interface QuickAddSeed {
	fromId: string | null;
	toId: string | null;
}

/**
 * Picks the one entity a side can be filled with without guessing: the default
 * account (or the only one) for accounts, the sole candidate for every other
 * type. A side allowing several types is left to the user.
 */
function seedSide(types: EntityType[], entities: Entity[]): Entity | null {
	const type = types.length === 1 ? types[0] : null;
	if (!type) return null;

	const candidates = entities.filter(
		(e) => e.type === type && isEntityActive(e) && e.id !== BALANCE_ADJUSTMENT_ENTITY_ID
	);

	if (type === 'account') {
		const preferred = candidates.find((e) => e.is_default);
		if (preferred) return preferred;
	}
	return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Pre-fills as much of the form as the board makes unambiguous. The
 * destination is dropped when it would duplicate the source (a transfer to
 * itself) or when their currencies disagree — both are states the form would
 * reject anyway. With no source to compare against, the destination stands on
 * its own; picking a source later re-checks it and clears it if it no longer
 * fits.
 */
export function seedQuickAddSelection(kind: QuickAddKindSpec, entities: Entity[]): QuickAddSeed {
	const from = seedSide(kind.fromTypes, entities);
	const to = seedSide(kind.toTypes, entities);

	const toIsUsable =
		to !== null && to.id !== from?.id && (!from || to.currency === from.currency);

	return { fromId: from?.id ?? null, toId: toIsUsable ? to.id : null };
}
