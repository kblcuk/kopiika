import type { EntityWithBalance } from '@/src/types';

/**
 * The flow a drag-and-drop drop resolves to on the home board.
 *
 * `none`        — no actionable drop (no target, or dropped on itself).
 * `refund`      — reverse-direction drop that opens the refund picker. The
 *                 picker works against the *original* transaction direction, so
 *                 `originalFrom`/`originalTo` describe that original flow, not the
 *                 drag direction.
 * `reservation` — account → saving, which reserves funds rather than spending.
 * `transaction` — the default money-moving flow (source spends/moves to target).
 */
export type DropFlow =
	| { kind: 'none' }
	| { kind: 'refund'; originalFrom: EntityWithBalance; originalTo: EntityWithBalance }
	| { kind: 'reservation'; account: EntityWithBalance; saving: EntityWithBalance }
	| { kind: 'transaction'; from: EntityWithBalance; to: EntityWithBalance };

/**
 * Resolve which flow a drop should trigger from the dragged `source` entity onto
 * `target`. Pure routing only — it assumes the pair is already a valid
 * money-moving combination (the grid passes a target only for valid flows;
 * blocked pairs such as category → category never reach here with a target).
 */
export function resolveDropFlow(
	source: EntityWithBalance,
	target: EntityWithBalance | null
): DropFlow {
	// No target (cancelled / same-type reorder handled by the grid) or dropped
	// on itself — nothing to do.
	if (!target || source.id === target.id) {
		return { kind: 'none' };
	}

	// Category → Account: refund against the original account → category flow.
	if (source.type === 'category' && target.type === 'account') {
		return { kind: 'refund', originalFrom: target, originalTo: source };
	}

	// Account → Income: refund against the original income → account flow.
	if (source.type === 'account' && target.type === 'income') {
		return { kind: 'refund', originalFrom: target, originalTo: source };
	}

	// Account → Saving: reserve funds instead of spending them.
	if (source.type === 'account' && target.type === 'saving') {
		return { kind: 'reservation', account: source, saving: target };
	}

	// Default money-moving flow: source moves to target.
	return { kind: 'transaction', from: source, to: target };
}
