import type { EntityType, EntityColorKey } from '@/src/types';
import { colors } from '@/src/theme/colors';
import { ENTITY_COLOR_PALETTE } from '@/src/constants/entity-colors';

type ColorPair = { bgColor: string; iconColor: string };

const entityTypeDefaults: Record<EntityType, ColorPair> = {
	income: {
		bgColor: 'rgba(212, 101, 47, 0.1)',
		iconColor: colors.accent.DEFAULT,
	},
	account: {
		bgColor: '#D4C8B3',
		iconColor: colors.ink.muted,
	},
	category: {
		bgColor: 'rgba(47, 125, 74, 0.1)',
		iconColor: colors.positive.DEFAULT,
	},
	saving: {
		bgColor: 'rgba(43, 95, 138, 0.1)',
		iconColor: colors.info.DEFAULT,
	},
};

export const getEntityTypeDefaults = (type: EntityType): ColorPair => entityTypeDefaults[type];

export const getEntityColors = (type: EntityType, color?: string | null): ColorPair => {
	if (color && color in ENTITY_COLOR_PALETTE) {
		return ENTITY_COLOR_PALETTE[color as EntityColorKey];
	}
	return entityTypeDefaults[type];
};
