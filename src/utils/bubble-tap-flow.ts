import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import type { EntityWithBalance } from '@/src/types';

/**
 * What tapping an entity bubble on the home board means.
 *
 * KII-154: a tap used to navigate to filtered history, but testers read a tap as
 * "record something here". Each branch routes to a modal the board already owns.
 *
 * `transaction` — quickAdd `TransactionModal`; either slot may be null and the
 *                 user picks it in the modal.
 * `reservation` — `ReservationModal`; account → saving is a reservation on this
 *                 board, matching `resolveDropFlow`.
 * `detail`      — `EntityDetailModal`; edit-mode taps, and the fallback when a
 *                 saving has no account that could fund it.
 */
export type BubbleTapFlow =
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
 * Resolve which flow a tap on `entity` should open. Pure routing — the caller
 * owns the modal state.
 */
export function resolveBubbleTapFlow(
	entity: EntityWithBalance,
	ctx: { isEditing: boolean; entities: EntityWithBalance[] }
): BubbleTapFlow {
	// Edit mode keeps its existing meaning: a tap edits the entity.
	if (ctx.isEditing) return { kind: 'detail', entity };

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
