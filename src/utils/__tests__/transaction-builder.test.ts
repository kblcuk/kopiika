import { describe, expect, test } from 'bun:test';
import {
	buildRecurringTemplate,
	buildSavingsReleases,
	buildSplitRows,
	buildTransaction,
	defaultIsConfirmed,
	normalizeCreateTimestamp,
} from '../transaction-builder';

describe('transaction-builder', () => {
	describe('normalizeCreateTimestamp', () => {
		test('keeps the calendar day from `date` and time-of-day from `now`', () => {
			// Local-time ISO strings (no Z / offset) so the test does not depend on TZ.
			const date = new Date('2026-05-15T00:00:00');
			const now = new Date('2026-01-01T14:37:12.456');
			const result = new Date(normalizeCreateTimestamp(date, now));
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(4);
			expect(result.getDate()).toBe(15);
			expect(result.getHours()).toBe(14);
			expect(result.getMinutes()).toBe(37);
			expect(result.getSeconds()).toBe(12);
			expect(result.getMilliseconds()).toBe(456);
		});

		test('does not mutate the input date', () => {
			const date = new Date('2026-05-15T00:00:00');
			const before = date.getTime();
			normalizeCreateTimestamp(date, new Date('2026-01-01T12:00:00'));
			expect(date.getTime()).toBe(before);
		});
	});

	describe('defaultIsConfirmed', () => {
		test('past timestamp → confirmed', () => {
			expect(defaultIsConfirmed(1000, 5000)).toBe(true);
		});
		test('equal timestamp → confirmed', () => {
			expect(defaultIsConfirmed(5000, 5000)).toBe(true);
		});
		test('future timestamp → unconfirmed', () => {
			expect(defaultIsConfirmed(10_000, 5000)).toBe(false);
		});
	});

	describe('buildTransaction', () => {
		test('produces a non-empty id', () => {
			const tx = buildTransaction({
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount: 5,
				currency: 'USD',
				timestamp: 100,
			});
			expect(typeof tx.id).toBe('string');
			expect(tx.id.length).toBeGreaterThan(0);
		});

		test('two consecutive builds yield distinct ids', () => {
			const t1 = buildTransaction({
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount: 1,
				currency: 'USD',
				timestamp: 1,
			});
			const t2 = buildTransaction({
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount: 1,
				currency: 'USD',
				timestamp: 1,
			});
			expect(t1.id).not.toBe(t2.id);
		});

		test('passes through fields and defaults is_confirmed from timestamp', () => {
			const past = buildTransaction(
				{
					from_entity_id: 'a',
					to_entity_id: 'b',
					amount: 5,
					currency: 'USD',
					timestamp: 1_000,
				},
				2_000
			);
			expect(past.is_confirmed).toBe(true);

			const future = buildTransaction(
				{
					from_entity_id: 'a',
					to_entity_id: 'b',
					amount: 5,
					currency: 'USD',
					timestamp: 10_000,
				},
				2_000
			);
			expect(future.is_confirmed).toBe(false);
		});

		test('explicit is_confirmed wins over the default', () => {
			const tx = buildTransaction(
				{
					from_entity_id: 'a',
					to_entity_id: 'b',
					amount: 1,
					currency: 'USD',
					timestamp: 100,
					is_confirmed: false,
				},
				50
			);
			expect(tx.is_confirmed).toBe(false);
		});

		test('omits optional fields when caller did not provide them', () => {
			const tx = buildTransaction({
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount: 1,
				currency: 'USD',
				timestamp: 100,
			});
			expect('note' in tx).toBe(false);
			expect('series_id' in tx).toBe(false);
			expect('notification_id' in tx).toBe(false);
		});

		test('passes through note and series_id when provided', () => {
			const tx = buildTransaction({
				from_entity_id: 'a',
				to_entity_id: 'b',
				amount: 1,
				currency: 'USD',
				timestamp: 100,
				note: 'lunch',
				series_id: 'series-1',
			});
			expect(tx.note).toBe('lunch');
			expect(tx.series_id).toBe('series-1');
		});
	});

	describe('buildSplitRows', () => {
		test('produces anchor + non-anchor rows with shared currency/timestamp/note', () => {
			const rows = buildSplitRows({
				fromEntityId: 'acc-1',
				currency: 'USD',
				timestamp: 1_700_000_000_000,
				note: 'shopping',
				splitTotal: 100,
				splits: [
					{ toEntityId: 'cat-anchor', amount: '' },
					{ toEntityId: 'cat-2', amount: '30' },
					{ toEntityId: 'cat-3', amount: '20' },
				],
			});
			expect(rows).toHaveLength(3);
			// Anchor amount = 100 - 30 - 20 = 50
			expect(rows[0]).toMatchObject({
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-anchor',
				amount: 50,
				currency: 'USD',
				timestamp: 1_700_000_000_000,
				note: 'shopping',
			});
			expect(rows[1]).toMatchObject({ to_entity_id: 'cat-2', amount: 30 });
			expect(rows[2]).toMatchObject({ to_entity_id: 'cat-3', amount: 20 });
		});

		test('skips anchor when its computed amount is zero or negative', () => {
			const rows = buildSplitRows({
				fromEntityId: 'acc-1',
				currency: 'USD',
				timestamp: 1,
				splitTotal: 50,
				splits: [
					{ toEntityId: 'cat-anchor', amount: '' },
					{ toEntityId: 'cat-2', amount: '50' },
				],
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].to_entity_id).toBe('cat-2');
		});

		test('skips anchor when entity is not picked', () => {
			const rows = buildSplitRows({
				fromEntityId: 'acc-1',
				currency: 'USD',
				timestamp: 1,
				splitTotal: 100,
				splits: [
					{ toEntityId: null, amount: '' },
					{ toEntityId: 'cat-2', amount: '30' },
				],
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].to_entity_id).toBe('cat-2');
			expect(rows[0].amount).toBe(30);
		});

		test('skips non-anchor rows that lack entity or have non-positive amount', () => {
			const rows = buildSplitRows({
				fromEntityId: 'acc-1',
				currency: 'USD',
				timestamp: 1,
				splitTotal: 100,
				splits: [
					{ toEntityId: 'cat-anchor', amount: '' },
					{ toEntityId: null, amount: '20' }, // dropped: no entity
					{ toEntityId: 'cat-3', amount: '' }, // dropped: empty
					{ toEntityId: 'cat-4', amount: '0' }, // dropped: zero
					{ toEntityId: 'cat-5', amount: '25' },
				],
			});
			// Anchor amount subtracts every typed non-anchor amount, even rows that
			// will be dropped (matches the modal's pre-refactor behavior, so an
			// entity-less typed amount still "claims" its share of the total).
			expect(rows).toHaveLength(2);
			expect(rows[0]).toMatchObject({ to_entity_id: 'cat-anchor', amount: 55 });
			expect(rows[1]).toMatchObject({ to_entity_id: 'cat-5', amount: 25 });
		});

		test('returns [] when splits array is empty', () => {
			expect(
				buildSplitRows({
					fromEntityId: 'a',
					currency: 'USD',
					timestamp: 1,
					splitTotal: 0,
					splits: [],
				})
			).toEqual([]);
		});

		test('rounds anchor amount to two decimals', () => {
			const rows = buildSplitRows({
				fromEntityId: 'acc-1',
				currency: 'USD',
				timestamp: 1,
				splitTotal: 100,
				splits: [
					{ toEntityId: 'cat-anchor', amount: '' },
					{ toEntityId: 'cat-2', amount: '33.33' },
					{ toEntityId: 'cat-3', amount: '33.33' },
				],
			});
			expect(rows[0].amount).toBe(33.34);
		});
	});

	describe('buildSavingsReleases', () => {
		test('produces saving → account rows, all confirmed', () => {
			const rows = buildSavingsReleases({
				accountId: 'acc-1',
				currency: 'USD',
				timestamp: 5_000,
				funded: [
					{ savingEntityId: 'sav-1', fundAmount: 30 },
					{ savingEntityId: 'sav-2', fundAmount: 20 },
				],
			});
			expect(rows).toHaveLength(2);
			for (const r of rows) {
				expect(r.is_confirmed).toBe(true);
				expect(r.to_entity_id).toBe('acc-1');
				expect(r.currency).toBe('USD');
				expect(r.timestamp).toBe(5_000);
			}
			expect(rows[0]).toMatchObject({ from_entity_id: 'sav-1', amount: 30 });
			expect(rows[1]).toMatchObject({ from_entity_id: 'sav-2', amount: 20 });
		});

		test('drops zero / negative / non-finite fund amounts', () => {
			const rows = buildSavingsReleases({
				accountId: 'acc-1',
				currency: 'USD',
				timestamp: 1,
				funded: [
					{ savingEntityId: 'sav-1', fundAmount: 0 },
					{ savingEntityId: 'sav-2', fundAmount: -5 },
					{ savingEntityId: 'sav-3', fundAmount: NaN },
					{ savingEntityId: 'sav-4', fundAmount: 10 },
				],
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].from_entity_id).toBe('sav-4');
		});
	});

	describe('buildRecurringTemplate', () => {
		test('serializes rule, copies fields, sets created_at', () => {
			const template = buildRecurringTemplate({
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-1',
				amount: 12.5,
				currency: 'USD',
				timestamp: 100,
				note: 'rent',
				rule: { type: 'monthly' },
				endDate: 200,
				endCount: 12,
				horizon: 90,
				now: 50,
			});
			expect(template).toMatchObject({
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-1',
				amount: 12.5,
				currency: 'USD',
				note: 'rent',
				rule: JSON.stringify({ type: 'monthly' }),
				start_date: 100,
				end_date: 200,
				end_count: 12,
				horizon: 90,
				created_at: 50,
			});
			expect(template.id.length).toBeGreaterThan(0);
		});

		test('defaults end_date / end_count to null when omitted', () => {
			const template = buildRecurringTemplate({
				from_entity_id: 'acc-1',
				to_entity_id: 'cat-1',
				amount: 1,
				currency: 'USD',
				timestamp: 1,
				rule: { type: 'weekly' },
				horizon: 30,
				now: 1,
			});
			expect(template.end_date).toBeNull();
			expect(template.end_count).toBeNull();
		});
	});
});
