import type { EntityType } from '@/src/types';
import { colors } from '@/src/theme/colors';

const entityTypeColors: Record<EntityType, { bg: string; iconColor: string }> = {
	income: {
		bg: 'bg-accent/10',
		iconColor: colors.accent.DEFAULT,
	},
	account: {
		bg: 'bg-paper-300',
		iconColor: colors.ink.muted,
	},
	category: {
		bg: 'bg-positive/10',
		iconColor: colors.positive.DEFAULT,
	},
	saving: {
		bg: 'bg-info/10',
		iconColor: colors.info.DEFAULT,
	},
};

// Get background and icon colors based on entity type
export const getEntityTypeColors = (type: EntityType) => entityTypeColors[type];
