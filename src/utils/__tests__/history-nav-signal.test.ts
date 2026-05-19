import { describe, it, expect, beforeEach } from 'bun:test';
import { consumePendingHistoryFilter, setPendingHistoryFilter } from '../history-nav-signal';

describe('history-nav-signal', () => {
	beforeEach(() => {
		consumePendingHistoryFilter();
	});

	it('returns null when nothing has been set', () => {
		expect(consumePendingHistoryFilter()).toBeNull();
	});

	it('returns the stored filter on consume', () => {
		setPendingHistoryFilter({ entityId: 'cat-1' });
		expect(consumePendingHistoryFilter()).toEqual({ entityId: 'cat-1' });
	});

	it('returns null on a second consume (one-shot)', () => {
		setPendingHistoryFilter({ entityId: 'cat-1', period: '2026-01' });
		consumePendingHistoryFilter();
		expect(consumePendingHistoryFilter()).toBeNull();
	});

	it('overwrites a previous pending filter when set again', () => {
		setPendingHistoryFilter({ entityId: 'cat-1' });
		setPendingHistoryFilter({ entityId: 'cat-2', period: '2025-12' });
		expect(consumePendingHistoryFilter()).toEqual({
			entityId: 'cat-2',
			period: '2025-12',
		});
	});
});
