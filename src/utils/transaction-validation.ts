import type { Entity, EntityType, Transaction } from '@/src/types';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { isEntityDeleted } from './entity-display';

export type TransactionValidationCode =
	| 'MISSING_FROM'
	| 'MISSING_TO'
	| 'SAME_ENTITY'
	| 'DELETED_FROM'
	| 'DELETED_TO'
	| 'INVALID_PAIR'
	| 'CURRENCY_MISMATCH'
	| 'INVALID_AMOUNT';

export type ValidationResult =
	| { ok: true }
	| { ok: false; code: TransactionValidationCode; message: string };

export class TransactionValidationError extends Error {
	readonly code: TransactionValidationCode;
	constructor(code: TransactionValidationCode, message: string) {
		super(message);
		this.name = 'TransactionValidationError';
		this.code = code;
	}
}

export interface MutationInput {
	from_entity_id: string;
	to_entity_id: string;
	amount: number;
	currency: string;
}

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

function findEntity(entities: Entity[], id: string): Entity | undefined {
	return entities.find((e) => e.id === id);
}

/**
 * Validates a transaction input for creation at the mutation boundary.
 *
 * This is the canonical validator that all mutation paths (UI, import, future
 * sync inbound ops) must run before persisting a transaction. UI-side picker
 * filtering (`getValidFromEntities` / `getValidToEntities`) prevents most
 * invalid states upstream, but this guards non-UI callers and is the single
 * source of truth for what "a valid transaction" means.
 *
 * Balance-adjustment carve-out: the system `BALANCE_ADJUSTMENT_ENTITY_ID`
 * skips the type-pair check (it is allowed to send to any account) and the
 * currency check (it adopts the target's currency).
 */
export function validateTransaction(input: MutationInput, entities: Entity[]): ValidationResult {
	if (!(Number.isFinite(input.amount) && input.amount > 0)) {
		return invalid('INVALID_AMOUNT', 'Amount must be a positive number.');
	}
	if (input.from_entity_id === input.to_entity_id) {
		return invalid('SAME_ENTITY', 'Source and destination must differ.');
	}

	const isAdjustmentFrom = input.from_entity_id === BALANCE_ADJUSTMENT_ENTITY_ID;
	const isAdjustmentTo = input.to_entity_id === BALANCE_ADJUSTMENT_ENTITY_ID;

	const fromEntity = findEntity(entities, input.from_entity_id);
	const toEntity = findEntity(entities, input.to_entity_id);

	if (!fromEntity)
		return invalid('MISSING_FROM', `Unknown source entity: ${input.from_entity_id}.`);
	if (!toEntity)
		return invalid('MISSING_TO', `Unknown destination entity: ${input.to_entity_id}.`);

	if (isEntityDeleted(fromEntity)) {
		return invalid('DELETED_FROM', `Source entity "${fromEntity.name}" is deleted.`);
	}
	if (isEntityDeleted(toEntity)) {
		return invalid('DELETED_TO', `Destination entity "${toEntity.name}" is deleted.`);
	}

	if (isAdjustmentFrom || isAdjustmentTo) {
		// Balance corrections can go either direction (BAL → account for positive
		// corrections, account → BAL for downward). The opposite side must be an
		// account; currency is dictated by that account.
		const accountSide = isAdjustmentFrom ? toEntity : fromEntity;
		if (accountSide.type !== 'account') {
			return invalid('INVALID_PAIR', 'Balance adjustment must pair with an account.');
		}
		if (input.currency !== accountSide.currency) {
			return invalid(
				'CURRENCY_MISMATCH',
				`Transaction currency ${input.currency} does not match account (${accountSide.currency}).`
			);
		}
		return { ok: true };
	}

	if (!isAllowedPair(fromEntity.type, toEntity.type)) {
		return invalid(
			'INVALID_PAIR',
			`Transactions from ${fromEntity.type} to ${toEntity.type} are not allowed.`
		);
	}

	if (fromEntity.currency !== toEntity.currency) {
		return invalid(
			'CURRENCY_MISMATCH',
			`Currency mismatch: ${fromEntity.currency} → ${toEntity.currency}.`
		);
	}
	if (input.currency !== fromEntity.currency) {
		return invalid(
			'CURRENCY_MISMATCH',
			`Transaction currency ${input.currency} does not match entities (${fromEntity.currency}).`
		);
	}

	return { ok: true };
}

/**
 * Validates an in-place update of an existing transaction.
 *
 * Carve-out preserved from the previous store logic: if the existing
 * transaction already references a deleted entity on a side that the patch
 * does NOT change, that side passes the deletion check (we cannot retroactively
 * invalidate a historical row just because the entity got soft-deleted).
 */
export function validateUpdate(
	existing: Transaction,
	patch: Partial<Pick<Transaction, 'from_entity_id' | 'to_entity_id' | 'amount' | 'currency'>>,
	entities: Entity[]
): ValidationResult {
	const finalFromId = patch.from_entity_id ?? existing.from_entity_id;
	const finalToId = patch.to_entity_id ?? existing.to_entity_id;
	const finalAmount = patch.amount ?? existing.amount;
	const finalCurrency = patch.currency ?? existing.currency;

	if (!(Number.isFinite(finalAmount) && finalAmount > 0)) {
		return invalid('INVALID_AMOUNT', 'Amount must be a positive number.');
	}
	if (finalFromId === finalToId) {
		return invalid('SAME_ENTITY', 'Source and destination must differ.');
	}

	const isAdjustmentFrom = finalFromId === BALANCE_ADJUSTMENT_ENTITY_ID;
	const isAdjustmentTo = finalToId === BALANCE_ADJUSTMENT_ENTITY_ID;
	const fromEntity = findEntity(entities, finalFromId);
	const toEntity = findEntity(entities, finalToId);

	if (!fromEntity) return invalid('MISSING_FROM', `Unknown source entity: ${finalFromId}.`);
	if (!toEntity) return invalid('MISSING_TO', `Unknown destination entity: ${finalToId}.`);

	const fromChanged = finalFromId !== existing.from_entity_id;
	const toChanged = finalToId !== existing.to_entity_id;

	if (isEntityDeleted(fromEntity) && fromChanged) {
		return invalid('DELETED_FROM', `Source entity "${fromEntity.name}" is deleted.`);
	}
	if (isEntityDeleted(toEntity) && toChanged) {
		return invalid('DELETED_TO', `Destination entity "${toEntity.name}" is deleted.`);
	}

	if (isAdjustmentFrom || isAdjustmentTo) {
		const accountSide = isAdjustmentFrom ? toEntity : fromEntity;
		if (accountSide.type !== 'account') {
			return invalid('INVALID_PAIR', 'Balance adjustment must pair with an account.');
		}
		if (finalCurrency !== accountSide.currency) {
			return invalid(
				'CURRENCY_MISMATCH',
				`Transaction currency ${finalCurrency} does not match account (${accountSide.currency}).`
			);
		}
		return { ok: true };
	}

	if (!isAllowedPair(fromEntity.type, toEntity.type)) {
		return invalid(
			'INVALID_PAIR',
			`Transactions from ${fromEntity.type} to ${toEntity.type} are not allowed.`
		);
	}

	if (fromEntity.currency !== toEntity.currency) {
		return invalid(
			'CURRENCY_MISMATCH',
			`Currency mismatch: ${fromEntity.currency} → ${toEntity.currency}.`
		);
	}
	if (finalCurrency !== fromEntity.currency) {
		return invalid(
			'CURRENCY_MISMATCH',
			`Transaction currency ${finalCurrency} does not match entities (${fromEntity.currency}).`
		);
	}

	return { ok: true };
}

/**
 * Throws `TransactionValidationError` if the result is invalid; otherwise no-op.
 * Use at mutation boundaries (`addTransaction`, `applyOperation`, etc.).
 */
export function ensureValid(result: ValidationResult): void {
	if (!result.ok) {
		throw new TransactionValidationError(result.code, result.message);
	}
}

function invalid(code: TransactionValidationCode, message: string): ValidationResult {
	return { ok: false, code, message };
}
