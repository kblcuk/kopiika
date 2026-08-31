import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { EntityWithBalance } from '@/src/types';

/**
 * What "record something here" means for an entity bubble on the home board.
 *
 * KII-154 introduced this as the tap behaviour; it is now bound to whichever
 * gesture the user's `BubbleGestureMode` assigns to `add`, so the name is about
 * the intent, not the gesture. Each branch routes to a modal the board owns.
 *
 * `transaction` — quickAdd `TransactionModal`; either slot may be null and the
 *                 user picks it in the modal.
 * `reservation` — `ReservationModal`; account → saving is a reservation on this
 *                 board, matching `resolveDropFlow`.
 * `detail`      — `EntityDetailModal`; the fallback when a saving has no account
 *                 that could fund it.
 *
 * Edit mode is deliberately NOT handled here. "A tap edits the entity" is a
 * property of the tap gesture, not of the add flow — if it lived in this
 * function it would follow the gesture swap and leave edit mode reachable only
 * by long-press. The home screen applies it on the tap path instead.
 */
export type BubbleAddFlow =
	| { kind: 'transaction'; from: EntityWithBalance | null; to: EntityWithBalance | null }
	| { kind: 'reservation'; account: EntityWithBalance; saving: EntityWithBalance }
	| { kind: 'detail'; entity: EntityWithBalance };

/**
 * Pick the account a tap should spend from / reserve from.
 *
 * Prefers the user's flagged default, else the first account in board order.
 * The fallback matters: `is_default` is only ever set by the toggle in
 * `EntityDetailModal`, and onboarding never sets one — so relying on the flag
 * alone would leave a freshly-onboarded user with an empty source slot.
 *
 * The deleted / balance-adjustment filters are defensive. Callers pass entities
 * from `useEntitiesWithBalance`, which already excludes both
 * (`src/store/index.ts:1167`); the filters keep this correct if it is ever
 * handed the raw store list.
 */
export function resolveFundingAccount(
	entities: EntityWithBalance[],
	currency: string
): EntityWithBalance | null {
	const candidates = entities.filter(
		(e) =>
			e.type === 'account' &&
			e.id !== BALANCE_ADJUSTMENT_ENTITY_ID &&
			e.is_deleted !== true &&
			e.currency === currency
	);

	const flagged = candidates.find((e) => e.is_default === true);
	if (flagged) return flagged;

	// Same ordering `getEntitiesWithBalance` applies, so "first" means the same
	// thing here as it does on the board.
	return [...candidates].sort((a, b) => a.row - b.row || a.position - b.position)[0] ?? null;
}

/**
 * Resolve which flow the add gesture on `entity` should open. Pure routing —
 * the caller owns the modal state.
 */
export function resolveBubbleAddFlow(
	entity: EntityWithBalance,
	ctx: { entities: EntityWithBalance[] }
): BubbleAddFlow {
	switch (entity.type) {
		// Categories only ever receive money, so the tapped one is the destination.
		case 'category':
			return {
				kind: 'transaction',
				from: resolveFundingAccount(ctx.entities, entity.currency),
				to: entity,
			};

		// Income can only ever send money. An account can do either, and
		// "spend from here" is the far likelier intent behind tapping one.
		case 'income':
		case 'account':
			return { kind: 'transaction', from: entity, to: null };

		case 'saving': {
			const account = resolveFundingAccount(ctx.entities, entity.currency);
			// `ReservationModal` renders nothing without an account, so fall back to
			// the detail modal — which embeds the reservation UI itself — rather than
			// silently doing nothing.
			return account
				? { kind: 'reservation', account, saving: entity }
				: { kind: 'detail', entity };
		}
	}
}
