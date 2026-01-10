// Entity types
export type EntityType = 'income' | 'account' | 'category' | 'saving';

export interface Entity {
	id: string;
	type: EntityType;
	name: string;
	currency: string;
	icon?: string;
	color?: string;
	owner_id?: string;
	order: number;
}

// Plan types
export type PlanPeriod = 'month';

export interface Plan {
	id: string;
	entity_id: string;
	period: PlanPeriod;
	period_start: string; // YYYY-MM format
	planned_amount: number;
}

// Transaction types
export interface Transaction {
	id: string;
	from_entity_id: string;
	to_entity_id: string;
	amount: number;
	currency: string;
	timestamp: number;
	note?: string;
}

// Derived types for UI
export interface EntityWithBalance extends Entity {
	planned: number;
	actual: number;
	remaining: number;
}

// Helper to get current period in YYYY-MM format
export function getCurrentPeriod(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get period start/end timestamps
export function getPeriodRange(period: string): { start: number; end: number } {
	const [year, month] = period.split('-').map(Number);
	const start = new Date(year, month - 1, 1).getTime();
	const end = new Date(year, month, 0, 23, 59, 59, 999).getTime();
	return { start, end };
}
