import { describe, it, expect } from 'bun:test';
import { pickInitialScrollSectionIndex, type InitialScrollSection } from '../history-scroll';

const upcoming: InitialScrollSection = { isUpcoming: true };
const unconfirmed: InitialScrollSection = { isUnconfirmed: true };
const past: InitialScrollSection = {};

describe('pickInitialScrollSectionIndex', () => {
	it('returns 0 when sections are empty', () => {
		expect(pickInitialScrollSectionIndex([])).toBe(0);
	});

	it('returns 0 when only past sections exist', () => {
		expect(pickInitialScrollSectionIndex([past, past])).toBe(0);
	});

	it('returns 0 when only the upcoming section exists (nothing to scroll past)', () => {
		expect(pickInitialScrollSectionIndex([upcoming])).toBe(0);
	});

	it('returns 0 when unconfirmed leads (no upcoming above it)', () => {
		expect(pickInitialScrollSectionIndex([unconfirmed, past])).toBe(0);
	});

	it('skips upcoming and lands on unconfirmed when both exist', () => {
		expect(pickInitialScrollSectionIndex([upcoming, unconfirmed, past])).toBe(1);
	});

	it('skips upcoming and lands on the first past section when no unconfirmed', () => {
		expect(pickInitialScrollSectionIndex([upcoming, past, past])).toBe(1);
	});
});
