import { describe, expect, test } from 'bun:test';
import { buildBackgroundNotificationKey } from '../background-task';

describe('buildBackgroundNotificationKey', () => {
	test('returns a stable sorted key for overdue transaction ids', () => {
		expect(buildBackgroundNotificationKey(['tx-2', 'tx-1'])).toBe('tx-1,tx-2');
	});

	test('returns null when there are no overdue transactions', () => {
		expect(buildBackgroundNotificationKey([])).toBeNull();
	});
});
