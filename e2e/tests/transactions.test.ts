import { by, element, waitFor } from 'detox';

import {
	createTransaction,
	ensureHomeScreen,
	expectAmount,
	getAmount,
	launchAppFast,
	tapUntilVisible,
} from '../support/helpers';
import { TestIDs } from '../support/test-ids';

// Quick-add ([+]) happy path on the home screen. The exhaustive picker
// inclusion/exclusion matrix and modal validation behaviour live in
// `transaction-validation.test.ts` and `transaction-modal.test.tsx` —
// here we only cover the device-only integration: tap [+], pick entities
// through the native pageSheet pickers, type an amount, save, and verify
// the resulting balance change on the home screen.
describe('Transactions — quick add', () => {
	beforeAll(async () => {
		await launchAppFast();
	});

	beforeEach(async () => {
		await ensureHomeScreen();
	});

	it('[+] Account → Category: balances update after save', async () => {
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await createTransaction('Main Card', 'Groceries', '43.21');

		await expectAmount('Groceries', before.cat + 43.21);
		await expectAmount('Main Card', before.acct - 43.21);
	});

	it('[+] Destination picker: dismissal preserves the parent modal state', async () => {
		const amount = 29.43;
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.transaction.amountInput)).typeText(String(amount));

		await tapUntilVisible(
			by.id(TestIDs.transaction.fromButton),
			by.id(TestIDs.fromOption('Main Card'))
		);
		await tapUntilVisible(
			by.id(TestIDs.fromOption('Main Card')),
			by.id(TestIDs.entitySelectionSheet.toSheet)
		);
		await waitFor(element(by.id(TestIDs.toOption('Groceries'))))
			.toBeVisible()
			.withTimeout(5000);

		await tapUntilVisible(
			by.id(TestIDs.entitySelectionSheet.closeButton),
			by.id(TestIDs.transaction.amountInput)
		);
		await waitFor(element(by.id(TestIDs.entitySelectionSheet.toSheet)))
			.not.toBeVisible()
			.withTimeout(5000);
		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.toHaveText(String(amount))
			.withTimeout(5000);

		await tapUntilVisible(
			by.id(TestIDs.transaction.toButton),
			by.id(TestIDs.entitySelectionSheet.toSheet)
		);
		await waitFor(element(by.id(TestIDs.toOption('Groceries'))))
			.toBeVisible()
			.withTimeout(5000);
		await tapUntilVisible(
			by.id(TestIDs.toOption('Groceries')),
			by.id(TestIDs.transaction.amountInput)
		);
		await waitFor(element(by.id(TestIDs.entitySelectionSheet.toSheet)))
			.not.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.transaction.saveButton)).tap();

		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.not.toBeVisible()
			.withTimeout(5000);
		await expectAmount('Groceries', before.cat + amount);
		await expectAmount('Main Card', before.acct - amount);
	});
});
