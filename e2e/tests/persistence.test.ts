import { device, waitFor, element, by } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { TestIDs } from '../support/test-ids';
import { getAmount, launchAppFast } from '../support/helpers';
import { seedFixture } from '../support/fixture';

// Verifies that transactions survive an app relaunch. Only an emulator with
// real SQLite persistence can detect this class of regression — there is no
// headless equivalent. The transaction is seeded directly into SQLite so the
// test stays focused on the relaunch behaviour (creation via the [+] flow is
// covered in transactions.test.ts).
describe('Persistence', () => {
	beforeAll(async () => {
		await launchAppFast();
	});

	it('transaction survives app relaunch (SQLite persists)', async () => {
		const before = await getAmount('Groceries');
		await seedFixture([{ from: 'Main Card', to: 'Groceries', amount: 25.0 }]);
		const afterSeed = await getAmount('Groceries');
		jestExpect(afterSeed).toBe(before + 25.0);

		// Relaunch without wiping data — keeps the installed binary and SQLite DB
		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.entityBubble('Groceries'))))
			.toBeVisible()
			.withTimeout(10000);

		// Balance must reflect the transaction that was seeded before relaunch
		jestExpect(await getAmount('Groceries')).toBe(afterSeed);
	});
});
