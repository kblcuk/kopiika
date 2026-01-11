import type { EntityType } from '@/src/types';

// category and savings need same icons
const sharedIcons = [
	'book',
	'bottle-wine',
	'briefcase-conveyor-belt',
	'bus',
	'car',
	'cat',
	'coffee',
	'dog',
	'dumbbell',
	'film',
	'gift',
	'graduation-cap',
	'heart',
	'home',
	'plane',
	'shield',
	'shirt',
	'shopping-cart',
	'smartphone',
	'soap-dispenser-droplet',
	'sofa',
	'star',
	'tent-tree',
	'users',
	'utensils',
	'zap',
];

// Icon options per entity type
export const ICON_OPTIONS: Record<EntityType, string[]> = {
	income: ['briefcase', 'building', 'gift', 'percent', 'trending-up', 'wallet'],
	account: ['credit-card', 'banknote', 'landmark', 'piggy-bank', 'wallet', 'coins'],
	category: sharedIcons,
	saving: sharedIcons,
};

// Default icons per type
export const DEFAULT_ICONS: Record<EntityType, string> = {
	income: 'briefcase',
	account: 'credit-card',
	category: 'shopping-cart',
	saving: 'piggy-bank',
};
