import { useCallback, useMemo, useState } from 'react';

import type { EntityWithBalance } from '@/src/types';

interface DetailModalProps {
	visible: boolean;
	entity: EntityWithBalance | null;
	onClose: () => void;
}

export interface UseEntityDetailFlow {
	/** Open the detail modal for an entity (e.g. tapping a bubble in edit mode). */
	open: (entity: EntityWithBalance) => void;
	detailModalProps: DetailModalProps;
}

/**
 * Owns the entity detail modal. Independent of the other board flows.
 */
export function useEntityDetailFlow(): UseEntityDetailFlow {
	const [visible, setVisible] = useState(false);
	const [entity, setEntity] = useState<EntityWithBalance | null>(null);

	const open = useCallback((next: EntityWithBalance) => {
		setEntity(next);
		setVisible(true);
	}, []);

	const handleClose = useCallback(() => {
		setVisible(false);
		setEntity(null);
	}, []);

	const detailModalProps = useMemo<DetailModalProps>(
		() => ({ visible, entity, onClose: handleClose }),
		[visible, entity, handleClose]
	);

	return { open, detailModalProps };
}
