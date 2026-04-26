import { expect as jestExpect } from '@jest/globals';
import {
	createTransaction,
	ensureHomeScreen,
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

		jestExpect(await getAmount('Groceries')).toBe(before.cat + 43.21);
		jestExpect(await getAmount('Main Card')).toBe(before.acct - 43.21);
	});
});
