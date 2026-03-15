import type { EntityType } from '@/src/types';

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
		const isCrossType = targetType !== sourceType;
		const isSameTypeTransfer = sourceType === 'account' && targetType === 'account';

		if ((isCrossType || isSameTypeTransfer) && sourceType !== 'saving') {
			return { kind: 'transaction', targetId };
		}
	}

	if (dragBehavior === 'reorder') {
		return { kind: 'reorder', orderedIds };
	}

	return { kind: 'none' };
}
