import { device, waitFor, element, by } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { TestIDs } from '../support/test-ids';
import { createTransaction, getAmount, launchFreshAndDismissOverlays } from '../support/helpers';

// Verifies that transactions survive an app relaunch. Only an emulator with
// real SQLite persistence can detect this class of regression — there is no
// headless equivalent.
describe('Persistence', () => {
	beforeAll(async () => {
		await launchFreshAndDismissOverlays();
	});

	it('transaction survives app relaunch (SQLite persists)', async () => {
		const before = await getAmount('Groceries');

		await createTransaction('Main Card', 'Groceries', '25.00');

		const afterCreate = await getAmount('Groceries');
		jestExpect(afterCreate).toBe(before + 25.0);

		// Relaunch without wiping data — keeps the installed binary and SQLite DB
		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(10000);

		// Balance must reflect the transaction that was created before relaunch
		jestExpect(await getAmount('Groceries')).toBe(afterCreate);
	});
});
