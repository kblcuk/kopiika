import { describe, expect, test } from 'bun:test';
import { earlyConfirmPrompt } from '../early-confirm';

const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

describe('earlyConfirmPrompt', () => {
	test('returns null for an occurrence due today — confirmation is one tap', () => {
		expect(earlyConfirmPrompt(at(2026, 8, 3, 23), at(2026, 8, 3, 0))).toBeNull();
	});

	test('returns null for an overdue occurrence', () => {
		expect(earlyConfirmPrompt(at(2026, 8, 1), at(2026, 8, 3))).toBeNull();
	});

	test('returns both labels when the occurrence is ahead of its date', () => {
		const prompt = earlyConfirmPrompt(at(2026, 8, 5), at(2026, 8, 3));
		expect(prompt).not.toBeNull();
		expect(prompt!.scheduledLabel).toContain('Aug');
		expect(prompt!.scheduledLabel).toContain('5');
		expect(prompt!.todayLabel).toContain('3');
	});

	test('labels differ so the dialog can name both dates', () => {
		const prompt = earlyConfirmPrompt(at(2026, 8, 5), at(2026, 8, 3))!;
		expect(prompt.scheduledLabel).not.toBe(prompt.todayLabel);
	});
});
