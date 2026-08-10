import type { Entity, EntityType, Plan } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { generateId } from '@/src/utils/ids';
import { toMinor } from '@/src/utils/money';

export interface PresetChip {
	type: EntityType;
	name: string;
	icon: string;
	defaultSelected?: boolean;
	// Authored as a major-unit number (e.g. 1500 = 1,500 in the app's currency);
	// converted to integer minor units (KII-120) at `createPlansForEntities`.
	suggestedPlan?: number;
}

/**
 * Stable id for a chip — used to track selection state and to map an
 * entity back to its originating chip when writing plans.
 */
export function presetKey(chip: PresetChip): string {
	return `${chip.type}:${chip.name}`;
}

export const PRESET_CHIPS: PresetChip[] = [
	{
		type: 'income',
		name: 'Salary',
		icon: 'briefcase',
		defaultSelected: true,
		suggestedPlan: 50000,
	},

	{
		type: 'account',
		name: 'Main Card',
		icon: 'credit-card',
		defaultSelected: true,
		suggestedPlan: 45000,
	},
	{ type: 'account', name: 'Cash', icon: 'banknote', defaultSelected: true, suggestedPlan: 5000 },
	{ type: 'account', name: 'Savings account', icon: 'piggy-bank' },

	{
		type: 'category',
		name: 'Groceries',
		icon: 'shopping-cart',
		defaultSelected: true,
		suggestedPlan: 8000,
	},
	{
		type: 'category',
		name: 'Transport',
		icon: 'car',
		defaultSelected: true,
		suggestedPlan: 3000,
	},
	{ type: 'category', name: 'Coffee', icon: 'coffee', suggestedPlan: 1500 },
	{ type: 'category', name: 'Rent', icon: 'home' },
	{ type: 'category', name: 'Entertainment', icon: 'film', suggestedPlan: 4000 },
	{ type: 'category', name: 'Subscriptions', icon: 'repeat' },

	{ type: 'saving', name: 'Vacation', icon: 'plane', suggestedPlan: 5000 },
	{ type: 'saving', name: 'Emergency Fund', icon: 'shield', suggestedPlan: 3000 },
];

/**
 * Realize a subset of preset chips into `Entity[]`. Row/position assignment
 * matches the sortable grid rules (categories spread across 3 rows; other
 * types sit on row 0). Order within a row is the order chips appear in `picked`.
 */
export function createEntitiesFromPresets(picked: PresetChip[], currency: string): Entity[] {
	const result: Entity[] = [];
	const positionCounters: Record<Exclude<EntityType, 'category'>, number> = {
		income: 0,
		account: 0,
		saving: 0,
	};

	// First pass: lay out categories round-robin so they spread across rows
	const categoryPicks = picked.filter((c) => c.type === 'category');
	const categoryAssignments = new Map<PresetChip, { row: number; position: number }>();
	const categoriesPerRow = Math.ceil(categoryPicks.length / 3);
	categoryPicks.forEach((chip, i) => {
		const row = Math.floor(i / Math.max(categoriesPerRow, 1));
		const position = i % Math.max(categoriesPerRow, 1);
		categoryAssignments.set(chip, { row, position });
	});

	for (const chip of picked) {
		let row = 0;
		let position = 0;

		if (chip.type === 'category') {
			const slot = categoryAssignments.get(chip)!;
			row = slot.row;
			position = slot.position;
		} else {
			position = positionCounters[chip.type as Exclude<EntityType, 'category'>]++;
		}

		result.push({
			id: generateId(),
			type: chip.type,
			name: chip.name,
			currency,
			icon: chip.icon,
			row,
			position,
		});
	}

	return result;
}

/**
 * Build plans for the given entities, looking up `suggestedPlan` per entity
 * via the supplied chip lookup. Entities without a chip lookup (or whose
 * chip has no `suggestedPlan`) get `planned_amount_minor = 0`.
 */
export function createPlansForEntities(
	entities: Entity[],
	entityToPreset: Map<string, PresetChip>,
	currency: string
): Plan[] {
	const period = getCurrentPeriod();
	return entities.map((entity) => {
		const suggested = entityToPreset.get(entity.id)?.suggestedPlan;
		return {
			id: generateId(),
			entity_id: entity.id,
			period: 'all-time' as const,
			period_start: period,
			planned_amount_minor: suggested ? toMinor(suggested, currency) : 0,
		};
	});
}
