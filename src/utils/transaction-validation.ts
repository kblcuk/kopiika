import type { Entity, EntityType } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { isEntityDeleted } from './entity-display';

/**
 * Defines which entity types can send money to which other types.
 * Core money flow: Income -> Account -> Category/Saving
 * Account can also transfer to other accounts.
 * Savings can release funds back to accounts.
 */
const ALLOWED_COMBINATIONS: Record<EntityType, EntityType[]> = {
	income: ['account'],
	account: ['category', 'account', 'saving'],
	category: ['account'],
	saving: ['account'],
};

/**
 * Returns whether a direct from→to transaction is allowed by type rules.
 * Does not check currency, deletion, or entity identity — just the type graph.
 */
export function isAllowedPair(fromType: EntityType, toType: EntityType): boolean {
	return ALLOWED_COMBINATIONS[fromType]?.includes(toType) ?? false;
}

/**
 * Returns which entity types can send money TO the given type.
 */
function getValidFromTypes(toType: EntityType): EntityType[] {
	const validTypes: EntityType[] = [];
	for (const [fromType, toTypes] of Object.entries(ALLOWED_COMBINATIONS)) {
		if (toTypes.includes(toType)) {
			validTypes.push(fromType as EntityType);
		}
	}
	return validTypes;
}

/**
 * Returns which entity types can receive money FROM the given type.
 */
function getValidToTypes(fromType: EntityType): EntityType[] {
	return ALLOWED_COMBINATIONS[fromType] ?? [];
}

/**
 * Filters entities that can be valid "from" sources for a given "to" entity.
 * Considers: type combination rules, currency matching, excludes same entity.
 * Balance adjustment is always excluded — it only applies at the account level.
 */
export function getValidFromEntities(
	entities: Entity[],
	toEntity: Entity | null,
	currency: string
): Entity[] {
	if (!toEntity) return [];

	const validFromTypes = getValidFromTypes(toEntity.type);

	return entities.filter((entity) => {
		if (entity.id === toEntity.id) return false;
		if (entity.id === BALANCE_ADJUSTMENT_ENTITY_ID) return false;
		if (isEntityDeleted(entity)) return false;
		if (entity.currency !== currency) return false;
		return validFromTypes.includes(entity.type);
	});
}

/**
 * Filters entities that can be valid "to" destinations for a given "from" entity.
 * Considers: type combination rules, currency matching, excludes same entity.
 * Optionally excludes a specific entity ID (useful for self-transfer prevention).
 */
export function getValidToEntities(
	entities: Entity[],
	fromEntity: Entity | null,
	currency: string,
	excludeId?: string
): Entity[] {
	if (!fromEntity) return [];

	// Balance adjustment entity cannot be a "to" target
	if (fromEntity.id === BALANCE_ADJUSTMENT_ENTITY_ID) {
		// When "from" is balance adjustment, "to" can be any account
		return entities.filter((entity) => {
			if (entity.id === excludeId) return false;
			if (entity.id === BALANCE_ADJUSTMENT_ENTITY_ID) return false;
			if (isEntityDeleted(entity)) return false;
			if (entity.currency !== currency) return false;
			return entity.type === 'account';
		});
	}

	const validToTypes = getValidToTypes(fromEntity.type);

	return entities.filter((entity) => {
		// Skip the same entity
		if (entity.id === fromEntity.id) return false;

		// Skip the excluded entity
		if (entity.id === excludeId) return false;

		// Balance adjustment cannot be a destination
		if (entity.id === BALANCE_ADJUSTMENT_ENTITY_ID) return false;

		if (isEntityDeleted(entity)) return false;

		// Must have matching currency
		if (entity.currency !== currency) return false;

		// Must be a valid type combination
		return validToTypes.includes(entity.type);
	});
}
