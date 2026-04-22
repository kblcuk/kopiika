import { describe, test, expect } from 'bun:test';
import { getEntityColors } from '../entity-colors';
import { ENTITY_COLOR_PALETTE } from '@/src/constants/entity-colors';
import { colors } from '@/src/theme/colors';

describe('getEntityColors', () => {
	test('returns type defaults when color is null', () => {
		const result = getEntityColors('income', null);
		expect(result.bgColor).toBe('rgba(212, 101, 47, 0.1)');
		expect(result.iconColor).toBe(colors.accent.DEFAULT);
	});

	test('returns type defaults when color is undefined', () => {
		const result = getEntityColors('category');
		expect(result.bgColor).toBe('rgba(47, 125, 74, 0.1)');
		expect(result.iconColor).toBe(colors.positive.DEFAULT);
	});

	test('returns palette colors for valid key', () => {
		const result = getEntityColors('income', 'emerald');
		expect(result.bgColor).toBe(ENTITY_COLOR_PALETTE.emerald.bgColor);
		expect(result.iconColor).toBe(ENTITY_COLOR_PALETTE.emerald.iconColor);
	});

	test('falls back to type default for unknown color key', () => {
		const result = getEntityColors('saving', 'nonexistent');
		expect(result.bgColor).toBe('rgba(43, 95, 138, 0.1)');
		expect(result.iconColor).toBe(colors.info.DEFAULT);
	});

	test('returns correct defaults for all entity types', () => {
		const account = getEntityColors('account');
		expect(account.bgColor).toBe('#D4C8B3');
		expect(account.iconColor).toBe(colors.ink.muted);

		const saving = getEntityColors('saving');
		expect(saving.bgColor).toBe('rgba(43, 95, 138, 0.1)');
		expect(saving.iconColor).toBe(colors.info.DEFAULT);
	});
});
