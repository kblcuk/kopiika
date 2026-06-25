import { useCallback, useMemo, useState } from 'react';

import type { EntityType } from '@/src/types';

interface CreateModalProps {
	visible: boolean;
	entityType: EntityType | null;
	onClose: () => void;
}

export interface UseEntityCreateFlow {
	/** Open the create modal for a given entity type. */
	open: (type: EntityType) => void;
	createModalProps: CreateModalProps;
}

/**
 * Owns the entity create modal. Independent of the other board flows.
 */
export function useEntityCreateFlow(): UseEntityCreateFlow {
	const [visible, setVisible] = useState(false);
	const [entityType, setEntityType] = useState<EntityType | null>(null);

	const open = useCallback((type: EntityType) => {
		setEntityType(type);
		setVisible(true);
	}, []);

	const handleClose = useCallback(() => {
		setVisible(false);
		setEntityType(null);
	}, []);

	const createModalProps = useMemo<CreateModalProps>(
		() => ({ visible, entityType, onClose: handleClose }),
		[visible, entityType, handleClose]
	);

	return { open, createModalProps };
}
