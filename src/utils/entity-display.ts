import type { Entity } from '@/src/types';

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
		return `Removed (${entity.name})`;
	}

	return entity.name;
}
