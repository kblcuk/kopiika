import type { Entity, Plan } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { generateId } from '@/src/utils/ids';

// Default entities for a fresh start
export function createDefaultEntities(): Entity[] {
	// Categories will be distributed across 3 rows (maxRows=3)
	// 4 categories: categoriesPerRow = ceil(4/3) = 2
	// Row 0: Groceries, Transport
	// Row 1: Coffee, Entertainment
	const categories = [
		{ name: 'Groceries', icon: 'shopping-cart' },
		{ name: 'Transport', icon: 'car' },
		{ name: 'Coffee', icon: 'coffee' },
		{ name: 'Entertainment', icon: 'film' },
	];

	const maxRows = 3;
	const categoriesPerRow = Math.ceil(categories.length / maxRows);

	return [
		// Income (row=0 for all single-row types)
		{
			id: generateId(),
			type: 'income' as const,
			name: 'Salary',
			currency: 'UAH',
			icon: 'briefcase',
			row: 0,
			position: 0,
			order: 0,
		},
		// Accounts
		{
			id: generateId(),
			type: 'account' as const,
			name: 'Main Card',
			currency: 'UAH',
			icon: 'credit-card',
			row: 0,
			position: 1,
			order: 0,
		},
		{
			id: generateId(),
			type: 'account' as const,
			name: 'Cash',
			currency: 'UAH',
			icon: 'banknote',
			row: 0,
			position: 2,
			order: 0,
		},
		// Categories (distributed across rows)
		...categories.map((cat, index) => ({
			id: generateId(),
			type: 'category' as const,
			name: cat.name,
			currency: 'UAH',
			icon: cat.icon,
			row: Math.floor(index / categoriesPerRow),
			position: index % categoriesPerRow,
			order: 0,
		})),
		// Savings
		{
			id: generateId(),
			type: 'saving' as const,
			name: 'Vacation',
			currency: 'UAH',
			icon: 'plane',
			row: 0,
			position: 0,
			order: 0,
		},
		{
			id: generateId(),
			type: 'saving' as const,
			name: 'Emergency Fund',
			currency: 'UAH',
			icon: 'shield',
			row: 0,
			position: 1,
			order: 0,
		},
	];
}

// Create default plans for entities
export function createDefaultPlans(entities: Entity[]): Plan[] {
	const period = getCurrentPeriod();

	const planAmounts: Record<string, number> = {
		Salary: 50000,
		'Main Card': 45000,
		Cash: 5000,
		Groceries: 8000,
		Transport: 3000,
		Coffee: 1500,
		Entertainment: 4000,
		Vacation: 5000,
		'Emergency Fund': 3000,
	};

	return entities.map((entity) => {
		return {
			id: generateId(),
			entity_id: entity.id,
			// Savings use 'all-time' period for goals, others use 'month'
			period: entity.type === 'saving' ? ('all-time' as const) : ('month' as const),
			// period_start is always a date (YYYY-MM) representing when the plan started
			period_start: period,
			planned_amount: planAmounts[entity.name] ?? 0,
		};
	});
}
