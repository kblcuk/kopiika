import { by, device, element, expect, waitFor } from 'detox';

import {
	createTransaction,
	ensureHomeScreen,
	expectAmount,
	getAmount,
	launchAppFast,
	tapUntilGone,
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

	// KII-154: a bubble tap opens quick-add pre-filled. Asserted on device
	// because the tap/long-press split depends on real gesture recognisers
	// (RNGH's Tap fails past 500ms), which are mocked in component tests.
	it('tapping a category bubble opens quick-add with it as the destination', async () => {
		await element(by.id(TestIDs.entityBubble('Groceries'))).tap();

		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.toBeVisible()
			.withTimeout(5000);
		await expect(
			element(by.text('Groceries').withAncestor(by.id(TestIDs.transaction.toButton)))
		).toBeVisible();

		await tapUntilGone(
			by.id(TestIDs.transaction.cancelButton),
			by.id(TestIDs.transaction.amountInput)
		);
		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.not.toExist()
			.withTimeout(5000);
	});

	it('tapping an account bubble opens quick-add with it as the source', async () => {
		await element(by.id(TestIDs.entityBubble('Main Card'))).tap();

		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.toBeVisible()
			.withTimeout(5000);
		await expect(
			element(by.text('Main Card').withAncestor(by.id(TestIDs.transaction.fromButton)))
		).toBeVisible();
		// The 'To' placeholder only renders in quickAdd mode with an empty slot,
		// so this asserts both the empty destination and that quickAdd is on.
		await expect(
			element(by.text('To').withAncestor(by.id(TestIDs.transaction.toButton)))
		).toBeVisible();

		await tapUntilGone(
			by.id(TestIDs.transaction.cancelButton),
			by.id(TestIDs.transaction.amountInput)
		);
		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.not.toExist()
			.withTimeout(5000);
	});

	// Reads the date the field is actually showing. On iOS the native compact
	// picker IS the field's value, so we read the picker itself; on Android there
	// is no inline widget and our formatted text is the value.
	//
	// Not asserted via the chips' `selected` accessibility state: iOS updates that
	// trait lazily after a re-render, so matching on it races the tap.
	async function readDateValue(): Promise<string> {
		if (device.getPlatform() === 'ios') {
			const attrs = (await element(
				by.type('RNDateTimePicker')
			).getAttributes()) as unknown as {
				dateComponents: { year: number; month: number; day: number };
			};
			const { year, month, day } = attrs.dateComponents;
			return `${year}-${month}-${day}`;
		}
		const attrs = (await element(
			by.id(TestIDs.transaction.dateDisplay)
		).getAttributes()) as unknown as { text: string };
		return attrs.text;
	}

	// The saved timestamp is covered exhaustively in transaction-modal.test.tsx.
	// What only a device can show is that the chip's tap actually lands: it sits
	// directly beneath a native compact DateTimePicker on iOS, and native picker
	// views have a history of both obscuring and swallowing neighbouring touches.
	// Asserting the field's own value — rather than that the chip is merely
	// present — is what makes this catch a swallowed tap.
	it('date presets: tapping Yesterday moves the date and Today restores it', async () => {
		await element(by.id(TestIDs.addTransactionButton)).tap();

		// No entity picking and no typing: the form fits one screen while the
		// amount is untouched, so the chips are reachable without a scroll and
		// without the keyboard covering anything.
		await waitFor(element(by.id(TestIDs.transaction.dateField)))
			.toBeVisible()
			.withTimeout(5000);

		const todayChip = element(by.id(TestIDs.transaction.datePreset('today')));
		const yesterdayChip = element(by.id(TestIDs.transaction.datePreset('yesterday')));

		const initial = await readDateValue();

		await yesterdayChip.tap();
		const afterYesterday = await readDateValue();
		if (afterYesterday === initial) {
			throw new Error(
				`Yesterday chip did not move the date: still ${initial}. The tap was ` +
					'accepted but had no effect — most likely swallowed by the native picker.'
			);
		}

		// Back to Today, so the test cannot pass on a field that simply drifted.
		await todayChip.tap();
		const afterToday = await readDateValue();
		if (afterToday !== initial) {
			throw new Error(`Today chip did not restore the date: ${afterToday} !== ${initial}`);
		}

		await tapUntilGone(
			by.id(TestIDs.transaction.cancelButton),
			by.id(TestIDs.transaction.amountInput)
		);
	});
});
