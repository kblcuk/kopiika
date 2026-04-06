import { device, waitFor, element, by } from 'detox';
import { expect as jestExpect } from '@jest/globals';
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

// Reads the numeric amount shown on a bubble. Handles both "," and "." as
// decimal separator depending on platform/locale.
async function getAmount(entityName: string): Promise<number> {
	const attrs = (await element(by.id(TestIDs.entityAmount(entityName))).getAttributes()) as {
		text: string;
	};
	return parseFloat(attrs.text.replace(',', '.'));
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

	// In quickAdd mode the to-picker opens automatically after selecting from
	await waitFor(element(by.id(TestIDs.entityOption(toName))))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.entityOption(toName))).tap();

	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(5000);
}

async function createTransactionViaDnD(fromName: string, toName: string, amount: string) {
	// On Android a drag starting near the top edge triggers the notification
	// shade — scroll down first to move bubbles away from the status bar.
	if (device.getPlatform() === 'android') {
		await element(by.id(TestIDs.homeScrollView)).scroll(150, 'down');
	}

	await element(by.id(TestIDs.entityBubble(fromName))).longPressAndDrag(
		600, // hold duration ms (> 150ms activation delay)
		0.5, // source X center
		0.5, // source Y center
		element(by.id(TestIDs.entityBubble(toName))),
		0.5, // target X center
		0.5, // target Y center
		'slow',
		300, // holdDuration after reaching target
	);

	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(5000);
}

// ── Suite ────────────────────────────────────────────────────────────────────

// Uses default seed entities (Salary, Main Card, Cash, Groceries, …) so no
// entity creation is needed. Amounts accumulate across tests — assertions
// check deltas, not absolute values.
//
// Note: income section is collapsed by default (incomeVisible=false). The [+]
// modal picker reads from the store directly, so Salary is selectable even
// when collapsed. Avoid calling getAmount('Salary') — its bubble is hidden.
describe('Transactions', () => {
	beforeAll(async () => {
		// Clean install — ensures fresh seed data for the whole suite
		await device.launchApp({ delete: true });
		await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(15000);
		await dismissWhatsNewIfPresent();
	});

	beforeEach(async () => {
		await device.launchApp({ newInstance: true });
		await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(10000);
	});

	// ── Account → Category ──────────────────────────────────────────────────

	it('Account → Category: category actual increases, account decreases', async () => {
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await createTransaction('Main Card', 'Groceries', '43.21');

		jestExpect(await getAmount('Groceries')).toBeCloseTo(before.cat + 43.21, 2);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.acct - 43.21, 2);
	});

	// ── Income → Account ────────────────────────────────────────────────────

	it('Income → Account: account balance increases', async () => {
		const before = await getAmount('Main Card');

		await createTransaction('Salary', 'Main Card', '127.50');

		jestExpect(await getAmount('Main Card')).toBeCloseTo(before + 127.50, 2);
	});

	// ── Account → Account ───────────────────────────────────────────────────

	it('Account → Account: money moves between accounts', async () => {
		const before = {
			from: await getAmount('Main Card'),
			to: await getAmount('Cash'),
		};

		await createTransaction('Main Card', 'Cash', '89.99');

		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.from - 89.99, 2);
		jestExpect(await getAmount('Cash')).toBeCloseTo(before.to + 89.99, 2);
	});

	// ── Cancel ──────────────────────────────────────────────────────────────

	it('Cancel: discarding the form does not change entity amounts', async () => {
		const before = await getAmount('Groceries');

		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.cancelButton)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.transaction.cancelButton)).tap();

		await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(5000);
		jestExpect(await getAmount('Groceries')).toBeCloseTo(before, 2);
	});

	// ── Drag & Drop ─────────────────────────────────────────────────────────

	it('DnD Account → Category: drag-and-drop opens modal with prefilled entities', async () => {
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await createTransactionViaDnD('Main Card', 'Groceries', '17.33');

		jestExpect(await getAmount('Groceries')).toBeCloseTo(before.cat + 17.33, 2);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.acct - 17.33, 2);
	});
});
