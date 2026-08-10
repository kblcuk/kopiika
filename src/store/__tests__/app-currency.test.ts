import { beforeEach, describe, expect, test } from 'bun:test';
import { resetDrizzleDb } from '@/src/db/drizzle-client';
import * as db from '@/src/db';
import type { Entity } from '@/src/types';
import { useStore } from '../index';

const account: Entity = {
	id: 'acc-1',
	type: 'account',
	name: 'Main Card',
	currency: 'EUR',
	row: 0,
	position: 0,
};

describe('store — appCurrency', () => {
	beforeEach(() => {
		resetDrizzleDb();
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			recurrenceTemplates: [],
			marketValueSnapshots: [],
			appCurrency: 'EUR',
		});
	});

	test('setAppCurrency relabels store entities and exposes the new currency', async () => {
		await db.createEntity(account);
		useStore.setState({ entities: [account] });

		await useStore.getState().setAppCurrency('GBP');

		expect(useStore.getState().appCurrency).toBe('GBP');
		// Assert on the row this test created. `setAppCurrency` re-reads from the
		// DB, which also contains the balance-adjustment entity seeded by
		// drizzle/0001 — so the store array is longer than what we inserted.
		const stored = useStore.getState().entities.find((e) => e.id === 'acc-1');
		expect(stored?.currency).toBe('GBP');
	});

	test('setAppCurrency persists the relabel to the database', async () => {
		await db.createEntity(account);
		useStore.setState({ entities: [account] });

		await useStore.getState().setAppCurrency('JPY');

		const persisted = await db.getAllEntities();
		expect(persisted.find((e) => e.id === 'acc-1')?.currency).toBe('JPY');
	});

	test('setAppCurrency with no entities still records the choice', async () => {
		await useStore.getState().setAppCurrency('UAH');
		expect(useStore.getState().appCurrency).toBe('UAH');
	});

	test('a transaction between rows created after a switch validates', async () => {
		// The regression that matters most: an entity created in the old currency
		// on a switched board fails cross-currency validation on its very next
		// transaction (src/utils/transaction-validation.ts).
		await db.createEntity(account);
		useStore.setState({ entities: [account] });
		await useStore.getState().setAppCurrency('GBP');

		const currency = useStore.getState().appCurrency;
		const category: Entity = {
			id: 'cat-1',
			type: 'category',
			name: 'Groceries',
			currency,
			row: 0,
			position: 1,
		};
		await useStore.getState().addEntity(category);

		await useStore.getState().addTransaction({
			id: 'tx-new',
			from_entity_id: 'acc-1',
			to_entity_id: 'cat-1',
			amount_minor: 500,
			currency,
			timestamp: 1700000000000,
		});

		const persisted = await db.getAllTransactions();
		expect(persisted.find((t) => t.id === 'tx-new')?.currency).toBe('GBP');
	});
});
