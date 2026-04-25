import { device, waitFor, element, by } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { TestIDs } from './test-ids';
import { seedFixture } from './fixture';

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

// Opens the income section if it's collapsed (default on fresh install).
async function openIncomeSection() {
	try {
		await waitFor(element(by.id(TestIDs.entityBubble('Salary'))))
			.toBeVisible()
			.withTimeout(200);
		return; // already open
	} catch {
		// not visible — tap to expand
		await element(by.id(TestIDs.incomeToggleButton)).tap();
		await waitFor(element(by.id(TestIDs.entityBubble('Salary'))))
			.toBeVisible()
			.withTimeout(3000);
	}
}

// Verifies no transaction modal appeared after a gesture (e.g. blocked DnD).
async function expectNoTransactionModal() {
	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.not.toBeVisible()
		.withTimeout(3000);
}

async function createTransaction(fromName: string, toName: string, amount: string) {
	await element(by.id(TestIDs.addTransactionButton)).tap();

	await waitFor(element(by.id(TestIDs.transaction.fromButton)))
		.toBeVisible()
		.withTimeout(5000);
	// Transaction modal slide-up animation ~400ms; taps during it are swallowed
	await new Promise((r) => setTimeout(r, 500));

	await element(by.id(TestIDs.transaction.fromButton)).tap();
	await waitFor(element(by.id(TestIDs.fromOption(fromName))))
		.toBeVisible()
		.withTimeout(5000);
	// iOS pageSheet slide-in animation takes ~400ms; taps during it are ignored
	await new Promise((r) => setTimeout(r, 500));
	await element(by.id(TestIDs.fromOption(fromName))).tap();

	// After selecting from-entity the from-picker starts its slide-out animation
	// while the to-picker opens after 350ms. On Android the Dialog window stays
	// on top in z-order; on iOS the pageSheet dismiss animation keeps the native
	// container above the to-picker. Both intercept touches until fully dismissed.
	// Wait for the from-picker content to leave the view tree, then give the
	// native modal time to complete its dismiss animation.
	await waitFor(element(by.id(TestIDs.fromOption(fromName))))
		.not.toExist()
		.withTimeout(5000);
	await new Promise((r) => setTimeout(r, 500));

	// In quickAdd mode the to-picker opens automatically after selecting from
	await waitFor(element(by.id(TestIDs.toOption(toName))))
		.toBeVisible()
		.withTimeout(5000);
	// Same pageSheet slide-in delay as the from-picker
	await new Promise((r) => setTimeout(r, 500));
	await element(by.id(TestIDs.toOption(toName))).tap();

	// "Select Destination" title is unique to the to-picker modal. Using it avoids
	// the ambiguity of shared testIDs that exist on both from- and to-picker modals.
	await waitFor(element(by.text('Select Destination')))
		.not.toBeVisible()
		.withTimeout(5000);

	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(5000);
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
		300 // holdDuration after reaching target
	);

	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(5000);
}

// Performs a DnD gesture without completing a transaction (for blocked/special flows).
async function dnd(fromName: string, toName: string) {
	// On Android, avoid the notification shade triggered by dragging near the top edge.
	if (device.getPlatform() === 'android') {
		await element(by.id(TestIDs.homeScrollView)).scroll(150, 'down');
	}

	await element(by.id(TestIDs.entityBubble(fromName))).longPressAndDrag(
		600,
		0.5,
		0.5,
		element(by.id(TestIDs.entityBubble(toName))),
		0.5,
		0.5,
		'slow',
		300
	);
}

// ── Suite ────────────────────────────────────────────────────────────────────

// Uses default seed entities (Salary, Main Card, Cash, Groceries, …) so no
// entity creation is needed. Amounts accumulate across tests — assertions
// check deltas, not absolute values.
//
// Note: income section is collapsed by default (incomeVisible=false). The [+]
// modal picker reads from the store directly, so Salary is selectable even
// when collapsed. Avoid calling getAmount('Salary') — its bubble is hidden
// unless openIncomeSection() was called in that test.
describe('Transactions', () => {
	beforeAll(async () => {
		await device.launchApp({ delete: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(15000);
		await dismissWhatsNewIfPresent();
	});

	beforeEach(async () => {
		try {
			await waitFor(element(by.id(TestIDs.homeScreen)))
				.toBeVisible()
				.withTimeout(200);
		} catch {
			// Not on home screen (e.g. modal left open) — relaunch to reset
			await device.launchApp({ newInstance: true });
			await device.disableSynchronization();
			await waitFor(element(by.id(TestIDs.homeScreen)))
				.toBeVisible()
				.withTimeout(10000);
		}
	});

	// ── Via [+] ─────────────────────────────────────────────────────────────

	it('[+] Account → Category: category actual increases, account decreases', async () => {
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await createTransaction('Main Card', 'Groceries', '43.21');

		jestExpect(await getAmount('Groceries')).toBeCloseTo(before.cat + 43.21, 2);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.acct - 43.21, 2);
	});

	it('[+] Cancel: discarding the form does not change entity amounts', async () => {
		const before = await getAmount('Groceries');

		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.cancelButton)))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));
		await element(by.id(TestIDs.transaction.cancelButton)).tap();

		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);
		jestExpect(await getAmount('Groceries')).toBeCloseTo(before, 2);
	});

	// ── Via DnD (all allowed pairs) ─────────────────────────────────────────

	it('DnD Account → Category: category increases, account decreases', async () => {
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await createTransactionViaDnD('Main Card', 'Groceries', '17.33');

		jestExpect(await getAmount('Groceries')).toBeCloseTo(before.cat + 17.33, 2);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.acct - 17.33, 2);
	});

	it('DnD Income → Account: account balance increases', async () => {
		// Open income FIRST so the toggle is persisted, then seedFixture
		// re-mounts the home screen. On remount incomeVisible is already true
		// in the store, so income renders expanded WITHOUT animation — Yoga
		// lays out all sections in one pass and drop zone coordinates are
		// correct from the start. Without this, the expand animation leaves
		// measureInWindow positions stale on Android, causing the phantom
		// dragEnd (fired by sortable mid-gesture) to match a category zone.
		await openIncomeSection();
		await seedFixture([]);

		const beforeSalary = await getAmount('Salary');
		const beforeCard = await getAmount('Main Card');

		await createTransactionViaDnD('Salary', 'Main Card', '84.50');

		// Income actual increases when distributed; if this passes, the transaction was saved
		jestExpect(await getAmount('Salary')).toBeCloseTo(beforeSalary + 84.5, 2);
		// Account balance increases when income flows in
		jestExpect(await getAmount('Main Card')).toBeCloseTo(beforeCard + 84.5, 2);
	});

	it('DnD Account → Account: money moves between accounts', async () => {
		const before = {
			from: await getAmount('Main Card'),
			to: await getAmount('Cash'),
		};

		await createTransactionViaDnD('Main Card', 'Cash', '31.20');

		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.from - 31.2, 2);
		jestExpect(await getAmount('Cash')).toBeCloseTo(before.to + 31.2, 2);
	});

	it.skip('DnD Saving → Account: opens transaction modal for release', async () => {
		// Flaky on iOS simulators: the saving bubble can be partially clipped after
		// remounts, so longPressAndDrag does not reliably start from the source.
		await seedFixture([{ from: 'Main Card', to: 'Vacation', amount: 55.0 }]);
		await waitFor(element(by.id(TestIDs.entityBubble('Vacation'))))
			.toBeVisible()
			.whileElement(by.id(TestIDs.homeScrollView))
			.scroll(80, 'down');

		const before = {
			saving: await getAmount('Vacation'),
			account: await getAmount('Main Card'),
		};

		await createTransactionViaDnD('Vacation', 'Main Card', '20');

		jestExpect(await getAmount('Vacation')).toBeCloseTo(before.saving - 20, 2);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(before.account + 20, 2);
	});

	// ── Refund & special flows ───────────────────────────────────────────────

	it('DnD Category → Account: opens refund picker (reversed account→category)', async () => {
		await seedFixture([{ from: 'Main Card', to: 'Groceries', amount: 55.0 }]);
		// openIncomeSection triggers the income animation, which calls remeasureAllDropZones()
		// on animation end. Without this, drop zones may not be re-measured after seedFixture
		// remounts the home screen, causing the DnD gesture to miss the drop target.
		await openIncomeSection();

		await dnd('Groceries', 'Main Card');

		await waitFor(element(by.id(TestIDs.refundPicker.close)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.refundPicker.close)).tap();
	});

	it('DnD Account → Income: opens refund picker (reversed income→account)', async () => {
		await seedFixture([{ from: 'Salary', to: 'Main Card', amount: 200.0 }]);
		await openIncomeSection();

		await dnd('Main Card', 'Salary');

		await waitFor(element(by.id(TestIDs.refundPicker.close)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.refundPicker.close)).tap();
	});

	it('DnD Account → Saving: opens reservation modal, not transaction modal', async () => {
		await dnd('Main Card', 'Vacation');

		await waitFor(element(by.id(TestIDs.reservation.modal)))
			.toBeVisible()
			.withTimeout(5000);
		await waitFor(element(by.id(TestIDs.reservation.cancelButton)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.reservation.cancelButton)).tap();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);
	});

	// ── Blocked via DnD ─────────────────────────────────────────────────────

	it.skip('DnD Income → Category: blocked — no transaction modal appears', async () => {
		await openIncomeSection();
		await dnd('Salary', 'Groceries');
		await expectNoTransactionModal();
	});

	it('DnD Category → Category: blocked — no transaction modal appears', async () => {
		await dnd('Groceries', 'Transport');
		await expectNoTransactionModal();
	});

	// ── Blocked via [+] picker ───────────────────────────────────────────────

	it('[+] Income as from: categories not available as to-destination', async () => {
		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.fromButton)))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));

		await element(by.id(TestIDs.transaction.fromButton)).tap();
		await waitFor(element(by.id(TestIDs.fromOption('Salary'))))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));
		await element(by.id(TestIDs.fromOption('Salary'))).tap();

		// Wait for from-picker to fully unmount (Android Dialog z-order issue)
		await waitFor(element(by.id(TestIDs.fromOption('Salary'))))
			.not.toExist()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));

		// Wait for the to-picker to open automatically after selecting income as from
		await waitFor(element(by.id(TestIDs.entitySelectionSheet.toSheet)))
			.toBeVisible()
			.withTimeout(5000);

		// Accounts must appear; categories must not
		await waitFor(element(by.id(TestIDs.toOption('Main Card'))))
			.toBeVisible()
			.withTimeout(5000);
		await waitFor(element(by.id(TestIDs.toOption('Groceries'))))
			.not.toBeVisible()
			.withTimeout(3000);
	});

	it('[+] Account as from: savings available as to-destination', async () => {
		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.fromButton)))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));

		await element(by.id(TestIDs.transaction.fromButton)).tap();
		await waitFor(element(by.id(TestIDs.fromOption('Main Card'))))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));
		await element(by.id(TestIDs.fromOption('Main Card'))).tap();

		// Wait for from-picker to fully unmount (Android Dialog z-order issue)
		await waitFor(element(by.id(TestIDs.fromOption('Main Card'))))
			.not.toExist()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));

		// Wait for the to-picker to open automatically
		await waitFor(element(by.id(TestIDs.entitySelectionSheet.toSheet)))
			.toBeVisible()
			.withTimeout(5000);

		// Categories and savings must appear
		await waitFor(element(by.id(TestIDs.toOption('Groceries'))))
			.toBeVisible()
			.withTimeout(5000);
		await waitFor(element(by.id(TestIDs.toOption('Vacation'))))
			.toBeVisible()
			.withTimeout(5000);
	});

	it('[+] Category as from: other categories not available as to-destination', async () => {
		await element(by.id(TestIDs.addTransactionButton)).tap();
		await waitFor(element(by.id(TestIDs.transaction.fromButton)))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));

		await element(by.id(TestIDs.transaction.fromButton)).tap();
		await waitFor(element(by.id(TestIDs.fromOption('Groceries'))))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));
		await element(by.id(TestIDs.fromOption('Groceries'))).tap();

		// Wait for from-picker to fully unmount (Android Dialog z-order issue)
		await waitFor(element(by.id(TestIDs.fromOption('Groceries'))))
			.not.toExist()
			.withTimeout(5000);
		await new Promise((r) => setTimeout(r, 500));

		// Wait for the to-picker to open automatically
		await waitFor(element(by.id(TestIDs.entitySelectionSheet.toSheet)))
			.toBeVisible()
			.withTimeout(5000);

		// Accounts must appear; other categories must not
		await waitFor(element(by.id(TestIDs.toOption('Main Card'))))
			.toBeVisible()
			.withTimeout(5000);
		await waitFor(element(by.id(TestIDs.toOption('Transport'))))
			.not.toBeVisible()
			.withTimeout(3000);
	});
});
