import {
	createTransaction,
	ensureHomeScreen,
	expectAmount,
	getAmount,
	launchFreshAndDismissOverlays,
} from '../support/helpers';

// Quick-add ([+]) happy path on the home screen. The exhaustive picker
// inclusion/exclusion matrix and modal validation behaviour live in
// `transaction-validation.test.ts` and `transaction-modal.test.tsx` —
// here we only cover the device-only integration: tap [+], pick entities
// through the native pageSheet pickers, type an amount, save, and verify
// the resulting balance change on the home screen.
describe('Transactions — quick add', () => {
	beforeAll(async () => {
		await launchFreshAndDismissOverlays();
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
});
