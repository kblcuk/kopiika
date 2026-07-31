import { device, waitFor, element, by } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { TestIDs } from '../support/test-ids';
import { createTransaction, getAmount, launchAppFast } from '../support/helpers';

// Verifies that transactions survive an app relaunch. Only an emulator with
// real SQLite persistence can detect this class of regression — there is no
// headless equivalent.
describe('Persistence', () => {
	beforeAll(async () => {
		await launchAppFast();
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

	it('collapsed section stays collapsed across relaunch', async () => {
		// Collapse Categories from its header and confirm the bubbles go away.
		await element(by.id(TestIDs.sectionCollapseToggle('category'))).tap();
		await waitFor(element(by.id(TestIDs.entityBubble('Groceries'))))
			.not.toBeVisible()
			.withTimeout(3000);

		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(10000);

		// Still collapsed — the flag came back from app-prefs, not from defaults.
		await waitFor(element(by.id(TestIDs.entityBubble('Groceries'))))
			.not.toBeVisible()
			.withTimeout(3000);

		// Expand again: collapse state persists across *suites* too, so leaving
		// Categories closed would break every later test that taps a category.
		await element(by.id(TestIDs.sectionCollapseToggle('category'))).tap();
		await waitFor(element(by.id(TestIDs.entityBubble('Groceries'))))
			.toBeVisible()
			.withTimeout(3000);
	});
});
