import type { EntityColorKey } from '@/src/types';

export type ColorPair = { bgColor: string; iconColor: string };

// Hues spaced ~45° apart and bg lightness alternates around the wheel
// (~73 / ~80) so adjacent hues separate in BOTH hue and L*. Without that
// alternation the cool/purple half collapses (sapphire ≈ amethyz ≈ lilac).
// jade and lilac were shifted off their old (sage / grey-purple) hues to
// break near-duplicates with emerald and amethyst.
//
// Invariants enforced by tests in __tests__/entity-colors.test.ts:
//   - iconColor / bgColor ≥ 4.5:1 (WCAG AA)
//   - iconColor / paper   ≥ 4.5:1 (icon readable on cream surface)
//   - pairwise ΔE76 between bgColors ≥ 12 (perceptually distinct at glance)
export const ENTITY_COLOR_PALETTE: Record<EntityColorKey, ColorPair> = {
	ruby: { bgColor: '#DB999F', iconColor: '#721820' },
	amber: { bgColor: '#E1DAB7', iconColor: '#62540E' },
	jade: { bgColor: '#ADCA91', iconColor: '#335115' },
	emerald: { bgColor: '#BDDBC9', iconColor: '#21633D' },
	teal: { bgColor: '#8BC7D0', iconColor: '#0F4D57' },
	sapphire: { bgColor: '#B9C4DF', iconColor: '#25407E' },
	amethyst: { bgColor: '#B19ACB', iconColor: '#4A2A6F' },
	lilac: { bgColor: '#E3C9DA', iconColor: '#822660' },
};

export const ENTITY_COLOR_KEYS = Object.keys(ENTITY_COLOR_PALETTE) as EntityColorKey[];
