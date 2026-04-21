import type { EntityType } from '@/src/types';
import { isAllowedPair } from '@/src/utils/transaction-validation';

interface ResolveGridDragEndArgs {
	dragBehavior: 'transaction' | 'reorder';
	sourceType: EntityType;
	targetType: EntityType | null;
	targetId: string | null;
	orderedIds: string[];
}

type GridDragEndResult =
	| {
			kind: 'transaction';
			targetId: string;
	  }
	| {
			kind: 'reorder';
			orderedIds: string[];
	  }
	| {
			kind: 'none';
	  };

export function resolveGridDragEnd({
	dragBehavior,
	sourceType,
	targetType,
	targetId,
	orderedIds,
}: ResolveGridDragEndArgs): GridDragEndResult {
	if (dragBehavior === 'transaction' && targetId && targetType) {
		// Allow if either direction is a valid transaction pair.
		// Forward (source→target) opens a transaction/reservation modal;
		// reverse (target→source) opens the refund picker.
		if (isAllowedPair(sourceType, targetType) || isAllowedPair(targetType, sourceType)) {
			return { kind: 'transaction', targetId };
		}
	}

	if (dragBehavior === 'reorder') {
		return { kind: 'reorder', orderedIds };
	}

	return { kind: 'none' };
}
