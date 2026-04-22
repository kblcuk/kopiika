import type { EntityColorKey } from '@/src/types';

export type ColorPair = { bgColor: string; iconColor: string };

export const ENTITY_COLOR_PALETTE: Record<EntityColorKey, ColorPair> = {
	amethyst: { bgColor: '#D8CEE0', iconColor: '#5C4A70' },
	emerald: { bgColor: '#C8DDD0', iconColor: '#2F6B4A' },
	sapphire: { bgColor: '#C8D5E5', iconColor: '#2B4F7A' },
	ruby: { bgColor: '#E0CCCC', iconColor: '#7A3030' },
	jade: { bgColor: '#D0DDD5', iconColor: '#3D5D4A' },
	amber: { bgColor: '#E0D5C0', iconColor: '#7A6030' },
	lilac: { bgColor: '#D5CDD8', iconColor: '#5A4A65' },
	teal: { bgColor: '#C5D5D5', iconColor: '#305555' },
};

export const ENTITY_COLOR_KEYS = Object.keys(ENTITY_COLOR_PALETTE) as EntityColorKey[];
