import { describe, test, expect } from 'bun:test';
import { ENTITY_COLOR_PALETTE } from '../entity-colors';
import type { EntityColorKey } from '@/src/types';

describe('ENTITY_COLOR_PALETTE', () => {
	test('contains all 8 palette keys', () => {
		const keys: EntityColorKey[] = [
			'amethyst',
			'emerald',
			'sapphire',
			'ruby',
			'jade',
			'amber',
			'lilac',
			'teal',
		];
		for (const key of keys) {
			expect(ENTITY_COLOR_PALETTE[key]).toBeDefined();
		}
	});

	test('each entry has bgColor and iconColor as hex strings', () => {
		const hexPattern = /^#[0-9A-Fa-f]{6}$/;
		for (const entry of Object.values(ENTITY_COLOR_PALETTE)) {
			expect(entry.bgColor).toMatch(hexPattern);
			expect(entry.iconColor).toMatch(hexPattern);
		}
	});
});
