import type { Entity, Plan } from '@/src/types';
import { getCurrentPeriod } from '@/src/types';
import { generateId } from '@/src/utils/ids';

// Default entities for a fresh start
export function createDefaultEntities(): Entity[] {
	return [
		// Income
		{
			id: generateId(),
			type: 'income',
			name: 'Salary',
			currency: 'UAH',
			icon: 'briefcase',
			order: 0,
		},
		// Accounts
		{
			id: generateId(),
			type: 'account',
			name: 'Main Card',
			currency: 'UAH',
			icon: 'credit-card',
			order: 0,
		},
		{
			id: generateId(),
			type: 'account',
			name: 'Cash',
			currency: 'UAH',
			icon: 'banknote',
			order: 1,
		},
		// Categories
		{
			id: generateId(),
			type: 'category',
			name: 'Groceries',
			currency: 'UAH',
			icon: 'shopping-cart',
			order: 0,
		},
		{
			id: generateId(),
			type: 'category',
			name: 'Transport',
			currency: 'UAH',
			icon: 'car',
			order: 1,
		},
		{
			id: generateId(),
			type: 'category',
			name: 'Coffee',
			currency: 'UAH',
			icon: 'coffee',
			order: 2,
		},
		{
			id: generateId(),
			type: 'category',
			name: 'Entertainment',
			currency: 'UAH',
			icon: 'film',
			order: 3,
		},
		// Savings
		{
			id: generateId(),
			type: 'saving',
			name: 'Vacation',
			currency: 'UAH',
			icon: 'plane',
			order: 0,
		},
		{
			id: generateId(),
			type: 'saving',
			name: 'Emergency Fund',
			currency: 'UAH',
			icon: 'shield',
			order: 1,
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
