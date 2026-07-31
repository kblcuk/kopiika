import { device, waitFor, element, by } from 'detox';
import { TestIDs } from './test-ids';

// KII-120: previously imported from `src/utils/format` — the helper was removed
// when monetary fields moved to integer minor units. The UI still displays
// major-unit decimal strings, so we keep a small local rounding helper here.
function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

// Marks onboarding as complete via the E2E deep-link route so the first-launch
// welcome/setup flow doesn't show. Returns once home is visible. Call after
// `device.launchApp({ delete: true })` in any suite that doesn't seed via
// `seedFixture` (which already sets the flag).
export async function skipOnboarding() {
	await device.openURL({ url: 'kopiika://e2e/skip-onboarding' });
	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(15000);
}

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
// Waits for the bubble to render — after a fresh install or relaunch the home
// grid hydrates entity-by-entity, and bubbles other than the first may not be
// in the view hierarchy yet when a test reads them.
export async function getAmount(entityName: string): Promise<number> {
	await waitFor(element(by.id(TestIDs.entityAmount(entityName))))
		.toBeVisible()
		.withTimeout(5000);
	const attrs = await element(by.id(TestIDs.entityAmount(entityName))).getAttributes();
	if ('elements' in attrs) {
		console.warn(`Found multiple entities matching [${entityName}], using first one`);
		return parseFloat(attrs.elements[0]!.label ?? '');
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

// Verifies no transaction modal appeared after a gesture (e.g. blocked DnD).
export async function expectNoTransactionModal() {
	await waitFor(element(by.id(TestIDs.transaction.amountInput)))
		.not.toBeVisible()
		.withTimeout(3000);
}

// Tap an element, retrying until a follow-up element becomes visible. Sync is
// disabled suite-wide (see e2e/README.md), so taps issued mid-animation are
// silently dropped — this replaces the fixed 500 ms sleeps that used to guard
// each tap. attemptInterval is set above the ~400 ms modal/picker animation
// duration so a successful first tap has time to settle before we'd retry —
// avoids re-firing into a still-animating sheet and hitting the wrong element.
export async function tapUntilVisible(
	tapMatcher: Detox.NativeMatcher,
	expectMatcher: Detox.NativeMatcher,
	{
		totalTimeout = 8000,
		attemptInterval = 600,
	}: { totalTimeout?: number; attemptInterval?: number } = {}
) {
	const deadline = Date.now() + totalTimeout;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await element(tapMatcher).tap();
		} catch (e) {
			lastError = e;
		}
		try {
			await waitFor(element(expectMatcher)).toBeVisible().withTimeout(attemptInterval);
			return;
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError ?? new Error('tapUntilVisible: timed out');
}

// Inverse of tapUntilVisible: tap an element, retrying until a follow-up element
// disappears (e.g. dismissing a modal via its cancel button). Sync is disabled
// suite-wide, so a single tap issued while a sheet is still sliding in is
// silently dropped and the modal never closes — retrying re-fires once the sheet
// is interactive. Re-tapping after the modal is already gone is a no-op since the
// tapMatcher no longer resolves (the tap error is swallowed).
export async function tapUntilGone(
	tapMatcher: Detox.NativeMatcher,
	expectMatcher: Detox.NativeMatcher,
	{
		totalTimeout = 8000,
		attemptInterval = 600,
	}: { totalTimeout?: number; attemptInterval?: number } = {}
) {
	const deadline = Date.now() + totalTimeout;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await element(tapMatcher).tap();
		} catch (e) {
			lastError = e;
		}
		try {
			await waitFor(element(expectMatcher)).not.toBeVisible().withTimeout(attemptInterval);
			return;
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError ?? new Error('tapUntilGone: timed out');
}

// Full [+] button happy path: open modal → pick from → pick to → enter amount → save.
export async function createTransaction(fromName: string, toName: string, amount: string) {
	await element(by.id(TestIDs.addTransactionButton)).tap();

	// Tap the from-button until the from-picker actually opens. Sync is off
	// suite-wide, so taps issued during the modal's slide-up animation can be
	// swallowed; re-tapping until the next state appears is cheaper and more
	// reliable than a blind fixed sleep.
	await tapUntilVisible(
		by.id(TestIDs.transaction.fromButton),
		by.id(TestIDs.fromOption(fromName))
	);

	// Pick the from-entity. After this the from-picker dismisses and the
	// to-picker auto-opens after a 350 ms delay; both transitions intercept
	// touches, so retry until the to-picker is interactive.
	await tapUntilVisible(by.id(TestIDs.fromOption(fromName)), by.id(TestIDs.toOption(toName)));

	// Pick the to-entity. The to-picker dismisses and the amount input takes
	// focus. Wait for the picker to fully dismiss before typing — typeText
	// taps to focus first, and that tap can otherwise hit the dismissing sheet.
	await tapUntilVisible(by.id(TestIDs.toOption(toName)), by.id(TestIDs.transaction.amountInput));
	await waitFor(element(by.text('Select Destination')))
		.not.toBeVisible()
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

// Tracks whether the app has been installed in this jest worker process.
// Reused across suites so only the first beforeAll pays the ~12-15 s install
// cost; subsequent suites cold-start the existing binary.
let hasInstalled = false;

// Lighter beforeAll for suites that don't depend on first-run UI state.
// Installs once per jest worker (delete + reinstall), then cold-starts the
// existing binary on subsequent suites. Saves ~12-15 s per suite. Tests that
// share the worker accumulate transaction state — assertions must use deltas.
// Sync is disabled globally — see e2e/README.md (home screen has continuous
// layout work, so Detox sync would never settle).
export async function launchAppFast() {
	if (hasInstalled) {
		await device.launchApp({ newInstance: true });
	} else {
		await device.launchApp({ delete: true });
		hasInstalled = true;
	}
	await device.disableSynchronization();
	// Fresh install lands on the onboarding welcome screen; bypass it via the
	// E2E deep-link so existing suites still land on home.
	await skipOnboarding();
	await dismissWhatsNewIfPresent();
	await waitFor(element(by.id(TestIDs.entityBubble('Main Card'))))
		.toBeVisible()
		.withTimeout(10000);
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
