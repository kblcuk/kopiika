import type { EntityType } from '@/src/types';

const entityTypeColors: Record<EntityType, { bg: string; iconColor: string }> = {
	income: {
		bg: 'bg-accent/10', // Soft terracotta tint
		iconColor: '#D4652F', // accent.DEFAULT
	},
	account: {
		bg: 'bg-paper-300', // Neutral beige
		iconColor: '#6B5D4A', // ink.muted
	},
	category: {
		bg: 'bg-positive/10', // Soft green tint
		iconColor: '#2F7D4A', // positive.DEFAULT
	},
	saving: {
		bg: 'bg-info/10', // Soft blue tint
		iconColor: '#2B5F8A', // info.DEFAULT
	},
};

/**
 * Returns background and icon colors based on entity type.
 * Used for consistent visual styling across entity displays.
 */
// Get background and icon colors based on entity type
export const getEntityTypeColors = (type: EntityType) => entityTypeColors[type];
