import { device, element, by, waitFor } from 'detox';
import { TestIDs } from '../support/test-ids';
import { tapUntilVisible } from '../support/helpers';

describe('Onboarding — first launch', () => {
	beforeAll(async () => {
		await device.launchApp({ delete: true });
		await device.disableSynchronization();
	});

	it('lands on welcome on fresh install', async () => {
		await waitFor(element(by.id(TestIDs.onboarding.welcomeScreen)))
			.toBeVisible()
			.withTimeout(15000);
	});

	it('completes onboarding with default selections', async () => {
		await waitFor(element(by.id(TestIDs.onboarding.welcomeContinueButton)))
			.toBeVisible()
			.withTimeout(5000);
		// Onboarding stack uses `animation: 'fade'`; sync is off, so the first
		// tap can land mid-animation and get swallowed. Retry until the next
		// screen's anchor element appears.
		await tapUntilVisible(
			by.id(TestIDs.onboarding.welcomeContinueButton),
			by.id(TestIDs.onboarding.setupContinueButton)
		);

		await tapUntilVisible(
			by.id(TestIDs.onboarding.setupContinueButton),
			by.id(TestIDs.homeScreen)
		);

		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(15000);

		// Default-selected always-visible entities should be on screen.
		// (Salary is an income entity — Income section is collapsed by default,
		// so we don't assert on it here.)
		await waitFor(element(by.id(TestIDs.entityBubble('Main Card'))))
			.toBeVisible()
			.withTimeout(5000);
		await waitFor(element(by.id(TestIDs.entityBubble('Groceries'))))
			.toBeVisible()
			.withTimeout(5000);
	});

	it('does not re-show onboarding on relaunch', async () => {
		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(15000);
	});
});
