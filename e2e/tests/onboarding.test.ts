import { device, element, by, waitFor } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { TestIDs } from '../support/test-ids';
import { tapUntilVisible, getAmount, dismissWhatsNewIfPresent } from '../support/helpers';

async function tap(id: string) {
	await waitFor(element(by.id(id)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(id)).tap();
}
async function dragExample(from: string, to: string) {
	await waitFor(element(by.id(TestIDs.entityBubble(from))))
		.toBeVisible()
		.withTimeout(5000);
	await waitFor(element(by.id(TestIDs.entityBubble(to))))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(TestIDs.entityBubble(from))).longPressAndDrag(
		600,
		0.5,
		0.5,
		element(by.id(TestIDs.entityBubble(to))),
		0.5,
		0.5,
		'slow',
		300
	);
}
async function saveExample(amount: string, reservation = false) {
	const input = reservation ? TestIDs.reservation.amountInput : TestIDs.transaction.amountInput;
	await waitFor(element(by.id(input)))
		.toBeVisible()
		.withTimeout(5000);
	await element(by.id(input)).replaceText(amount);
	await tap(reservation ? TestIDs.reservation.submitButton : TestIDs.transaction.saveButton);
	await waitFor(element(by.id(TestIDs.onboarding.practiceNext)))
		.toBeVisible()
		.withTimeout(5000);
	await tap(TestIDs.onboarding.practiceNext);
}

describe('Onboarding — first launch and practice', () => {
	beforeAll(async () => {
		await device.launchApp({ delete: true });
		await device.disableSynchronization();
	});
	it('lands on welcome on fresh install', async () => {
		await waitFor(element(by.id(TestIDs.onboarding.welcomeScreen)))
			.toBeVisible()
			.withTimeout(15000);
	});
	it('teaches income, spending, and reservations using real gestures and edited amounts', async () => {
		await tapUntilVisible(
			by.id(TestIDs.onboarding.welcomeContinueButton),
			by.id(TestIDs.onboarding.practiceScreen)
		);
		await tap(TestIDs.onboarding.practiceDemo);
		await dragExample('Salary', 'Main account');
		await saveExample('1200');
		await tap(TestIDs.entityBubble('Groceries'));
		await saveExample('50');
		await dragExample('Main account', 'Vacation');
		await saveExample('200', true);
		await waitFor(element(by.id(TestIDs.onboarding.practiceFinish)))
			.toBeVisible()
			.withTimeout(5000);
		jestExpect(await getAmount('Main account')).toBeCloseTo(950, 2);
		jestExpect(await getAmount('Vacation')).toBeCloseTo(200, 2);
		await tapUntilVisible(
			by.id(TestIDs.onboarding.practiceFinish),
			by.id(TestIDs.onboarding.setupContinueButton)
		);
	});
	it('creates only personal presets when setup completes and skips onboarding on relaunch', async () => {
		await tapUntilVisible(
			by.id(TestIDs.onboarding.setupContinueButton),
			by.id(TestIDs.homeScreen)
		);
		await dismissWhatsNewIfPresent();
		await waitFor(element(by.id(TestIDs.entityBubble('Main Card'))))
			.toBeVisible()
			.withTimeout(5000);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(0, 2);
		jestExpect(await getAmount('Groceries')).toBeCloseTo(0, 2);
		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(15000);
	});
	it('replays fresh, exits an open sheet, and keeps personal balances intact', async () => {
		const before = await getAmount('Main Card');
		await tap(TestIDs.settingsTabButton);
		await tap(TestIDs.settings.tapActionRow);
		await tapUntilVisible(
			by.id(TestIDs.bubbleGesturePicker.option('history')),
			by.id(TestIDs.settings.tourRow)
		);
		await tapUntilVisible(
			by.id(TestIDs.settings.tourRow),
			by.id(TestIDs.onboarding.practiceScreen)
		);
		await tap(TestIDs.onboarding.practiceRecord);
		await waitFor(element(by.id(TestIDs.onboarding.practiceSheetExit)))
			.toBeVisible()
			.withTimeout(5000);
		await tapUntilVisible(
			by.id(TestIDs.onboarding.practiceSheetExit),
			by.id(TestIDs.settings.tourRow)
		);
		await tapUntilVisible(
			by.id(TestIDs.settings.tourRow),
			by.id(TestIDs.onboarding.practiceScreen)
		);
		jestExpect(await getAmount('Main account')).toBeCloseTo(0, 2);
		await tapUntilVisible(
			by.id(TestIDs.onboarding.practiceExit),
			by.id(TestIDs.settings.tourRow)
		);
		await tap(TestIDs.dashboardTabButton);
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);
		jestExpect(await getAmount('Main Card')).toBeCloseTo(before, 2);
		await tap(TestIDs.entityBubble('Main Card'));
		await waitFor(element(by.id(TestIDs.historyScreen)))
			.toBeVisible()
			.withTimeout(5000);
		await tap(TestIDs.settingsTabButton);
		await tap(TestIDs.settings.tapActionRow);
		await tapUntilVisible(
			by.id(TestIDs.bubbleGesturePicker.option('add')),
			by.id(TestIDs.settings.tourRow)
		);
		await tap(TestIDs.dashboardTabButton);
	});
});
