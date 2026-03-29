import { device, waitFor, element, by, expect as detoxExpect } from 'detox';
import { TestIDs } from './test-ids';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function dismissWhatsNewIfPresent() {
	try {
		await waitFor(element(by.id(TestIDs.whatsNew.dismiss)))
			.toBeVisible()
			.withTimeout(2000);
		await element(by.id(TestIDs.whatsNew.dismiss)).tap();
	} catch {
		// Modal not present, continue
	}
}

async function createEntity(type: string, name: string, plannedAmount?: string) {
	await element(by.id(TestIDs.addEntityButton(type))).tap();
	await waitFor(element(by.id(TestIDs.entityCreate.nameInput)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.entityCreate.nameInput)).typeText(name);
	if (plannedAmount) {
		await element(by.id(TestIDs.entityCreate.amountInput)).tap();
		await element(by.id(TestIDs.entityCreate.amountInput)).typeText(plannedAmount);
	}
	await element(by.id(TestIDs.entityCreate.saveButton)).tap();
	await waitFor(element(by.id(TestIDs.entityBubble(name))))
		.toBeVisible()
		.withTimeout(5000);
}

async function createTransaction(fromName: string, toName: string, amount: string) {
	await element(by.id(TestIDs.addTransactionButton)).tap();
	await waitFor(element(by.id(TestIDs.transaction.fromButton)))
		.toBeVisible()
		.withTimeout(5000);

	await element(by.id(TestIDs.transaction.fromButton)).tap();
	await waitFor(element(by.id(TestIDs.entityOption(fromName))))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.entityOption(fromName))).tap();

	await element(by.id(TestIDs.transaction.toButton)).tap();
	await waitFor(element(by.id(TestIDs.entityOption(toName))))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.entityOption(toName))).tap();

	await element(by.id(TestIDs.transaction.amountInput)).clearText();
	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(5000);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Transactions', () => {
	beforeAll(async () => {
		// Clean install — ensures fresh storage for the whole suite
		await device.launchApp({ delete: true });
		await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(15000);
		await dismissWhatsNewIfPresent();
	});

	beforeEach(async () => {
		await device.launchApp({ newInstance: true });
		await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(10000);
	});

	// ── Account → Category ──────────────────────────────────────────────────

	it('Account → Category: category actual increases, account goes negative', async () => {
		await createEntity('account', 'Wallet');
		await createEntity('category', 'Groceries', '200');

		await createTransaction('Wallet', 'Groceries', '50');

		await detoxExpect(element(by.id(TestIDs.entityAmount('Groceries')))).toHaveText('50.00');
		await detoxExpect(element(by.id(TestIDs.entityAmount('Wallet')))).toHaveText('-50.00');
	});

	// ── Income → Account ────────────────────────────────────────────────────

	it('Income → Account: account balance increases', async () => {
		await createEntity('income', 'Salary', '500');
		await createEntity('account', 'MainCard');

		await createTransaction('Salary', 'MainCard', '500');

		await detoxExpect(element(by.id(TestIDs.entityAmount('MainCard')))).toHaveText('500.00');
	});

	// ── Account → Account ───────────────────────────────────────────────────

	it('Account → Account: money moves between accounts', async () => {
		await createEntity('income', 'WireIncome');
		await createEntity('account', 'Checking');
		await createEntity('account', 'Savings');

		// Fund Checking first
		await createTransaction('WireIncome', 'Checking', '500');
		// Transfer
		await createTransaction('Checking', 'Savings', '200');

		await detoxExpect(element(by.id(TestIDs.entityAmount('Checking')))).toHaveText('300.00');
		await detoxExpect(element(by.id(TestIDs.entityAmount('Savings')))).toHaveText('200.00');
	});

	// ── Cancel ──────────────────────────────────────────────────────────────

	it('Cancel: discarding the form does not change entity amounts', async () => {
		await createEntity('account', 'CancelWallet');
		await createEntity('category', 'CancelCat', '100');

		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.cancelButton)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.transaction.cancelButton)).tap();

		await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(5000);
		await detoxExpect(element(by.id(TestIDs.entityAmount('CancelCat')))).toHaveText('0.00');
	});
});
