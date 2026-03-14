import type { Entity } from '@/src/types';

const REMOVED_ENTITY_LABELS: Record<Entity['type'], string> = {
	income: 'Removed income source',
	account: 'Removed account',
	category: 'Removed category',
	saving: 'Removed savings goal',
};

export function isEntityDeleted(entity: Entity | null | undefined): boolean {
	return entity?.is_deleted === true;
}

export function isEntityActive(entity: Entity | null | undefined): entity is Entity {
	return !!entity && !isEntityDeleted(entity);
}

export function getEntityDisplayName(entity: Entity | null | undefined): string {
	if (!entity) {
		return 'Unknown';
	}

	if (isEntityDeleted(entity)) {
		return REMOVED_ENTITY_LABELS[entity.type];
	}

	return entity.name;
}
