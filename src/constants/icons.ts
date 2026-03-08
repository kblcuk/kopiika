import type { EntityType } from '@/src/types';

const allEntityIcons = [
	'briefcase',
	'building',
	'gift',
	'percent',
	'trending-up',
	'wallet',
	'credit-card',
	'banknote',
	'landmark',
	'piggy-bank',
	'coins',
	'baby',
	'book-open',
	'bottle-wine',
	'briefcase-conveyor-belt',
	'bus',
	'cake',
	'camera',
	'car',
	'cat',
	'cigarette',
	'coffee',
	'cookie',
	'diamond',
	'dog',
	'dumbbell',
	'film',
	'gamepad',
	'gem',
	'graduation-cap',
	'globe',
	'headphones',
	'heart',
	'home',
	'key',
	'laptop',
	'lightbulb',
	'mic',
	'music',
	'palette',
	'pizza',
	'plane',
	'rocket',
	'school',
	'shield',
	'shield-check',
	'shirt',
	'shopping-cart',
	'smartphone',
	'soap-dispenser-droplet',
	'sofa',
	'star',
	'tag',
	'tent-tree',
	'ticket',
	'tv',
	'umbrella',
	'user-check',
	'users',
	'utensils',
	'wifi',
	'zap',
];

function prioritizeIcons(preferredIcons: string[]): string[] {
	const seen = new Set<string>();

	return [...preferredIcons, ...allEntityIcons].filter((icon) => {
		if (seen.has(icon)) return false;
		seen.add(icon);
		return true;
	});
}

const incomeIcons = prioritizeIcons([
	'briefcase',
	'trending-up',
	'wallet',
	'banknote',
	'building',
	'coins',
	'gift',
	'percent',
	'landmark',
	'credit-card',
]);

const accountIcons = prioritizeIcons([
	'credit-card',
	'wallet',
	'banknote',
	'coins',
	'landmark',
	'piggy-bank',
	'building',
	'shield',
	'smartphone',
	'key',
]);

const categoryIcons = prioritizeIcons([
	'shopping-cart',
	'utensils',
	'coffee',
	'car',
	'home',
	'smartphone',
	'shirt',
	'heart',
	'dumbbell',
	'film',
	'gift',
	'plane',
]);

const savingIcons = prioritizeIcons([
	'piggy-bank',
	'shield',
	'plane',
	'home',
	'car',
	'smartphone',
	'graduation-cap',
	'gift',
	'heart',
	'tent-tree',
	'star',
	'rocket',
]);

export const ICON_OPTIONS: Record<EntityType, string[]> = {
	income: incomeIcons,
	account: accountIcons,
	category: categoryIcons,
	saving: savingIcons,
};

export const DEFAULT_ICONS: Record<EntityType, string> = {
	income: 'briefcase',
	account: 'credit-card',
	category: 'shopping-cart',
	saving: 'piggy-bank',
};
