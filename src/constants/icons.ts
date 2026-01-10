import type { EntityType } from '@/src/types';

// Icon options per entity type
export const ICON_OPTIONS: Record<EntityType, string[]> = {
	income: ['briefcase', 'building', 'gift', 'percent', 'trending-up', 'wallet'],
	account: ['credit-card', 'banknote', 'landmark', 'piggy-bank', 'wallet', 'coins'],
	category: [
		'shopping-cart',
		'car',
		'coffee',
		'film',
		'utensils',
		'home',
		'heart',
		'zap',
		'smartphone',
		'shirt',
		'book',
		'dumbbell',
		'cat',
		'dog',
	],
	saving: ['plane', 'shield', 'gift', 'home', 'graduation-cap', 'car', 'heart', 'star'],
};

// Default icons per type
export const DEFAULT_ICONS: Record<EntityType, string> = {
	income: 'briefcase',
	account: 'credit-card',
	category: 'shopping-cart',
	saving: 'piggy-bank',
};

// Convert kebab-case to PascalCase for lucide icon lookup
export function toIconName(name: string): string {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}
