import { describe, expect, test, beforeEach } from 'bun:test';
import { createTransaction, createTransactionBatch, getBatchEntityActuals } from '../transactions';
import { createEntity } from '../entities';
import { upsertPlan } from '../plans';
import { createMarketValueSnapshot } from '../market-values';
import { createRecurrenceTemplate } from '../recurrence-templates';
import { resetDrizzleDb } from '../drizzle-client';
import type { Entity, Transaction, Plan, MarketValueSnapshot } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';

// KII-120: every monetary field across the DB layer is integer minor units.
// A non-integer slipping through (e.g. a callsite forgetting to convert from
// a user-input float) would silently work today but accumulate ulp drift over
// many rows — exactly the bug this migration eliminates. The four assertions
// below guard each table's amount column at the read boundary.
//
// If one of these starts failing, look for a write site passing a float (e.g.
// `amount_minor: someUserInputNumber` without `toMinor`).
describe('KII-120 integer-minor-unit invariant', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	test('transactions.amount_minor is always an integer on round-trip', async () => {
		const from: Entity = {
			id: 'e-from',
			type: 'income',
			name: 'Salary',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 0,
		};
		const to: Entity = {
			id: 'e-to',
			type: 'account',
			name: 'Checking',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 1,
		};
		await createEntity(from);
		await createEntity(to);

		const tx: Transaction = {
			id: 'tx-1',
			from_entity_id: from.id,
			to_entity_id: to.id,
			amount_minor: 4321,
			currency: 'EUR',
			timestamp: Date.now(),
		};
		const persisted = await createTransaction(tx);

		expect(typeof persisted.amount_minor).toBe('number');
		expect(Number.isInteger(persisted.amount_minor)).toBe(true);
		expect(persisted.amount_minor).toBe(4321);
	});

	test('plans.planned_amount_minor is always an integer on round-trip', async () => {
		const entity: Entity = {
			id: 'e-cat',
			type: 'category',
			name: 'Groceries',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 0,
		};
		await createEntity(entity);

		const plan: Plan = {
			id: 'plan-1',
			entity_id: entity.id,
			period: 'all-time',
			period_start: '2026-06',
			planned_amount_minor: 30000,
		};
		const persisted = await upsertPlan(plan);

		expect(typeof persisted.planned_amount_minor).toBe('number');
		expect(Number.isInteger(persisted.planned_amount_minor)).toBe(true);
		expect(persisted.planned_amount_minor).toBe(30000);
	});

	test('recurrence_templates.amount_minor is always an integer on round-trip', async () => {
		const from: Entity = {
			id: 'e-from-r',
			type: 'account',
			name: 'Checking',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 0,
		};
		const to: Entity = {
			id: 'e-to-r',
			type: 'category',
			name: 'Rent',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 1,
		};
		await createEntity(from);
		await createEntity(to);

		const template: RecurrenceTemplate = {
			id: 'rt-1',
			from_entity_id: from.id,
			to_entity_id: to.id,
			amount_minor: 120000,
			currency: 'EUR',
			rule: '{"type":"monthly"}',
			start_date: Date.now(),
			end_date: null,
			end_count: null,
			horizon: 60,
			created_at: Date.now(),
		};
		const persisted = await createRecurrenceTemplate(template);

		expect(typeof persisted.amount_minor).toBe('number');
		expect(Number.isInteger(persisted.amount_minor)).toBe(true);
		expect(persisted.amount_minor).toBe(120000);
	});

	test('getBatchEntityActuals returns integer values (SUM path is exact)', async () => {
		// Guards the SQLite SUM → JS number coercion at
		// transactions.ts:Number(row.total ?? 0). For integer columns SQLite
		// returns a string; Number() parses it cleanly under 2^53. A
		// non-integer here would mean a writer slipped a float through, which
		// over many rows would re-introduce the drift this migration removes.
		const from: Entity = {
			id: 'inflow',
			type: 'income',
			name: 'Salary',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 0,
		};
		const to: Entity = {
			id: 'sink',
			type: 'account',
			name: 'Checking',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 1,
		};
		await createEntity(from);
		await createEntity(to);

		// Many small rows — pre-KII-120 a float SUM would drift here.
		const batch: Transaction[] = [];
		for (let i = 0; i < 500; i++) {
			batch.push({
				id: `t-${i}`,
				from_entity_id: from.id,
				to_entity_id: to.id,
				amount_minor: 10,
				currency: 'EUR',
				timestamp: 1700000000000 + i,
			});
		}
		await createTransactionBatch(batch);

		const actuals = await getBatchEntityActuals([from.id, to.id], 1600000000000, 1800000000000);
		const sinkActual = actuals.get(to.id)!;
		const sourceActual = actuals.get(from.id)!;

		expect(Number.isInteger(sinkActual)).toBe(true);
		expect(Number.isInteger(sourceActual)).toBe(true);
		expect(sinkActual).toBe(5000); // 500 × 10 cents = €50.00 received
		expect(sourceActual).toBe(-5000); // mirrored on the source side
	});

	test('market_value_snapshots.amount_minor is always an integer on round-trip', async () => {
		const entity: Entity = {
			id: 'e-inv',
			type: 'account',
			name: 'Brokerage',
			currency: 'EUR',
			order: 0,
			row: 0,
			position: 0,
			is_investment: true,
		};
		await createEntity(entity);

		const snapshot: MarketValueSnapshot = {
			id: 'snap-1',
			entity_id: entity.id,
			amount_minor: 5000000,
			currency: 'EUR',
			date: Date.now(),
		};
		const persisted = await createMarketValueSnapshot(snapshot);

		expect(typeof persisted.amount_minor).toBe('number');
		expect(Number.isInteger(persisted.amount_minor)).toBe(true);
		expect(persisted.amount_minor).toBe(5000000);
	});
});
