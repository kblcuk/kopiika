import { device, waitFor, element, by } from 'detox';
import { TestIDs } from './test-ids';
import { roundMoney } from '../../src/utils/format';

// Tap dismiss on the What's New modal if present. Uses a short timeout and
// swallows the error if the modal is absent.
export async function dismissWhatsNewIfPresent() {
	try {
		await waitFor(element(by.id(TestIDs.whatsNew.dismiss)))
			.toBeVisible()
			.withTimeout(2000);
		await element(by.id(TestIDs.whatsNew.dismiss)).tap();
	} catch {
		// Modal not present, continue
	}
}

// Reads the numeric amount shown on a bubble. Uses the accessibilityLabel
// which contains the raw numeric string, bypassing locale-dependent formatting.
export async function getAmount(entityName: string): Promise<number> {
	const attrs = await element(by.id(TestIDs.entityAmount(entityName))).getAttributes();
	if ('elements' in attrs) {
		console.warn(`Found multiple entities matching [${entityName}], using first one`);
		return parseFloat(attrs.elements[0].label ?? '');
	}
	return parseFloat(attrs.label ?? '');
}

// Polls until the amount on an entity bubble matches the expected value.
// Uses Detox's native toHaveLabel expectation for maximum performance and reliability.
export async function expectAmount(entityName: string, expected: number, timeout = 5000) {
	const expectedLabel = String(roundMoney(expected));
	await waitFor(element(by.id(TestIDs.entityAmount(entityName))))
		.toHaveLabel(expectedLabel)
		.withTimeout(timeout);
}

// Opens the income section if it's collapsed (default on fresh install).
export async function openIncomeSection() {
	try {
		await waitFor(element(by.id(TestIDs.entityBubble('Salary'))))
			.toBeVisible()
			.withTimeout(200);
		return; // already open
	} catch {
		await element(by.id(TestIDs.incomeToggleButton)).tap();
		await waitFor(element(by.id(TestIDs.entityBubble('Salary'))))
			.toBeVisible()
			.withTimeout(3000);
	}
}

// Verifies no transaction modal appeared after a gesture (e.g. blocked DnD).
export async function expectNoTransactionModal() {
	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.not.toBeVisible()
		.withTimeout(3000);
}

// Full [+] button happy path: open modal → pick from → pick to → enter amount → save.
export async function createTransaction(fromName: string, toName: string, amount: string) {
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
	await waitFor(element(by.id(TestIDs.fromOption(fromName))))
		.not.toExist()
		.withTimeout(5000);
	await new Promise((r) => setTimeout(r, 500));

	// In quickAdd mode the to-picker opens automatically after selecting from
	await waitFor(element(by.id(TestIDs.toOption(toName))))
		.toBeVisible()
		.withTimeout(5000);
	await new Promise((r) => setTimeout(r, 500));
	await element(by.id(TestIDs.toOption(toName))).tap();

	// "Select Destination" title is unique to the to-picker modal.
	await waitFor(element(by.text('Select Destination')))
		.not.toBeVisible()
		.withTimeout(5000);

	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	// Wait for the modal to dismiss
	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.not.toBeVisible()
		.withTimeout(5000);

	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(5000);
}

// Full DnD happy path: drag from → to → enter amount → save.
export async function createTransactionViaDnD(fromName: string, toName: string, amount: string) {
	await dnd(fromName, toName);

	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.transaction.amountInput)).typeText(amount);
	await element(by.id(TestIDs.transaction.saveButton)).tap();

	// Wait for the modal to dismiss
	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.not.toBeVisible()
		.withTimeout(5000);

	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(5000);
}

// Performs a DnD gesture without completing a transaction (for blocked/special flows).
export async function dnd(fromName: string, toName: string) {
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
}

// Fresh-install setup used in beforeAll. Disables sync globally for the suite
// (this app's home screen has continuous layout work — see e2e/CLAUDE.md).
export async function launchFreshAndDismissOverlays() {
	await device.launchApp({ delete: true });
	await device.disableSynchronization();
	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(15000);
	await dismissWhatsNewIfPresent();
}

// Per-test guard used in beforeEach. If a previous test left a modal open,
// relaunches the app to reset state — much cheaper than always relaunching.
export async function ensureHomeScreen() {
	try {
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(200);
	} catch {
		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(10000);
	}
}
