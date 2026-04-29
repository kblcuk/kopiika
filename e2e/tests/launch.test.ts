import { device, waitFor, element, by } from 'detox';
import { TestIDs } from '../support/test-ids';
import { dismissWhatsNewIfPresent } from '../support/helpers';

// App launch smoke tests. These cover the full app-shell path that only an
// emulator can verify: binary installs, JS bundle loads, native modules
// initialise, and the home screen becomes interactive.
describe('Launch', () => {
	beforeAll(async () => {
		await device.launchApp({ delete: true });
		await device.disableSynchronization();
	});

	// ── Smoke ────────────────────────────────────────────────────────────────

	it('home screen loads and entity grid is interactive after fresh install', async () => {
		// Verify the home screen is visible and the store hydrated by performing
		// a real interaction: tapping the income toggle should expand the income
		// section and reveal the Salary bubble.
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);

		await element(by.id(TestIDs.incomeToggleButton)).tap();
		await waitFor(element(by.id(TestIDs.entityBubble('Salary'))))
			.toBeVisible()
			.withTimeout(5000);
	});

	// ── What's New modal ─────────────────────────────────────────────────────

	it("What's New overlay appears after upgrade and can be dismissed", async () => {
		// The modal is suppressed on fresh install (lastSeen === null sets the
		// current version and returns). To trigger it we set lastSeen to an old
		// version via the E2E deep-link route, then relaunch — the app will see
		// lastSeen !== currentVersion and show the modal.
		await device.openURL({ url: 'kopiika://e2e/set-last-seen?version=0.0.0' });
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);

		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();

		await waitFor(element(by.id(TestIDs.whatsNew.dismiss)))
			.toBeVisible()
			.withTimeout(10000);
		await element(by.id(TestIDs.whatsNew.dismiss)).tap();

		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);
	});

	afterAll(async () => {
		await dismissWhatsNewIfPresent();
	});
});
