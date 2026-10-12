import { execFileSync } from 'child_process';
import { device, element, by, waitFor } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { seedFixture } from '../support/fixture';
import { TestIDs } from '../support/test-ids';
import {
	tapUntilVisible,
	tapUntilGone,
	getAmount,
	dismissWhatsNewIfPresent,
} from '../support/helpers';

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
	// Sync is off: let the sheet/focus animation settle, then let RN receive the edited value.
	await new Promise((resolve) => setTimeout(resolve, 400));
	await element(by.id(input)).replaceText(amount);
	await new Promise((resolve) => setTimeout(resolve, 250));
	await tapUntilVisible(
		by.id(reservation ? TestIDs.reservation.submitButton : TestIDs.transaction.saveButton),
		by.id(TestIDs.onboarding.practiceNext)
	);
	await waitFor(element(by.id(TestIDs.onboarding.practiceNext)))
		.toBeVisible()
		.withTimeout(5000);
	await tapUntilVisible(
		by.id(TestIDs.onboarding.practiceNext),
		by.id(reservation ? TestIDs.onboarding.practiceFinish : TestIDs.onboarding.practiceRecord)
	);
}

async function preparePersonalBoard() {
	await device.launchApp({ newInstance: true });
	await device.disableSynchronization();
	await seedFixture({
		clearEntities: true,
		clearTransactions: true,
		entities: [
			{ type: 'income', name: 'Salary', icon: 'briefcase' },
			{ type: 'account', name: 'Main Card', icon: 'wallet' },
			{ type: 'category', name: 'Groceries', icon: 'shopping-cart' },
		],
		transactions: [{ from: 'Salary', to: 'Main Card', amount: 123.45 }],
	});
	await dismissWhatsNewIfPresent();
}

describe('Onboarding — first launch and practice', () => {
	// This first-launch sequence shares state; retrying a step after later steps cannot reconstruct it.
	jest.retryTimes(0);
	beforeAll(async () => {
		await device.launchApp({ delete: true });
		await device.disableSynchronization();
	});
	it('teaches practice on first launch, then creates a personal board and skips onboarding on relaunch', async () => {
		await waitFor(element(by.id(TestIDs.onboarding.welcomeScreen)))
			.toBeVisible()
			.withTimeout(15000);
		await tapUntilVisible(
			by.id(TestIDs.onboarding.welcomeContinueButton),
			by.id(TestIDs.onboarding.practiceScreen)
		);
		await tap(TestIDs.onboarding.practiceDemo);
		await dragExample('Salary', 'Main account');
		await saveExample('1200');
		await device.sendToHome();
		await device.launchApp({ newInstance: false });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.onboarding.practiceScreen)))
			.toBeVisible()
			.withTimeout(10000);
		jestExpect(await getAmount('Main account')).toBeCloseTo(1200, 2);
		await tapUntilVisible(
			by.id(TestIDs.entityBubble('Groceries')),
			by.id(TestIDs.transaction.amountInput)
		);
		await saveExample('50');
		await tap(TestIDs.boardEditToggle);
		await tapUntilVisible(
			by.id(TestIDs.entityBubble('Groceries')),
			by.id(TestIDs.entityDetail.amountInput)
		);
		await waitFor(element(by.id(TestIDs.entityDetail.amountInput)))
			.toBeVisible()
			.withTimeout(5000);
		await new Promise((resolve) => setTimeout(resolve, 400));
		await element(by.id(TestIDs.entityDetail.amountInput)).replaceText('300');
		await tapUntilVisible(
			by.id(TestIDs.entityDetail.saveButton),
			by.id(TestIDs.onboarding.practiceNext)
		);
		const planned = (await element(by.id(TestIDs.dashboardPlannedAmount)).getAttributes()) as {
			text: string;
		};
		jestExpect(Number(planned.text.replace(/\s/g, '').replace(',', '.'))).toBeCloseTo(250, 2);
		jestExpect(await getAmount('Main account')).toBeCloseTo(1150, 2);
		await tapUntilVisible(
			by.id(TestIDs.onboarding.practiceNext),
			by.id(TestIDs.onboarding.practiceRecord)
		);
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
		await preparePersonalBoard();
		const before = await getAmount('Main Card');
		await tap(TestIDs.settingsTabButton);
		await tap(TestIDs.settings.tapActionRow);
		await tapUntilGone(
			by.id(TestIDs.bubbleGesturePicker.option('history')),
			by.id(TestIDs.bubbleGesturePicker.sheet)
		);
		await tapUntilVisible(
			by.id(TestIDs.settings.tourRow),
			by.id(TestIDs.onboarding.practiceScreen)
		);
		await tapUntilVisible(
			by.id(TestIDs.onboarding.practiceRecord),
			by.id(TestIDs.onboarding.practiceSheetExit)
		);
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
		await tapUntilGone(
			by.id(TestIDs.bubbleGesturePicker.option('add')),
			by.id(TestIDs.bubbleGesturePicker.sheet)
		);
		await tap(TestIDs.dashboardTabButton);
	});
	it('keeps the practice Save and Exit actions reachable with enlarged text', async () => {
		await preparePersonalBoard();
		const ios = device.getPlatform() === 'ios';
		const before = ios
			? execFileSync('xcrun', ['simctl', 'ui', device.id, 'content_size'], {
					encoding: 'utf8',
				}).trim()
			: execFileSync(
					'adb',
					['-s', device.id, 'shell', 'settings', 'get', 'system', 'font_scale'],
					{ encoding: 'utf8' }
				).trim();
		const setSize = (value: string) =>
			ios
				? execFileSync('xcrun', ['simctl', 'ui', device.id, 'content_size', value])
				: execFileSync('adb', [
						'-s',
						device.id,
						'shell',
						'settings',
						'put',
						'system',
						'font_scale',
						value,
					]);
		try {
			await device.terminateApp();
			setSize(ios ? 'accessibility-medium' : '1.8');
			// Enter after font configuration settles, with no sheet left over from another test.
			await device.launchApp({ newInstance: true });
			await device.disableSynchronization();
			await device.openURL({ url: 'kopiika://onboarding/practice?origin=settings' });
			await waitFor(element(by.id(TestIDs.onboarding.practiceScreen)))
				.toBeVisible()
				.withTimeout(10000);
			await waitFor(element(by.id(TestIDs.onboarding.practiceRecord)))
				.toBeVisible()
				.whileElement(by.id(TestIDs.onboarding.practiceScreen))
				.scroll(150, 'down');
			await tapUntilVisible(
				by.id(TestIDs.onboarding.practiceRecord),
				by.id(TestIDs.onboarding.practiceSheetExit)
			);
			await saveExample('1000');
			await waitFor(element(by.id(TestIDs.onboarding.practiceRecord)))
				.toBeVisible()
				.whileElement(by.id(TestIDs.onboarding.practiceScreen))
				.scroll(150, 'down');
			await tapUntilVisible(
				by.id(TestIDs.onboarding.practiceRecord),
				by.id(TestIDs.transaction.amountInput)
			);
			await saveExample('30');
			await waitFor(element(by.id(TestIDs.onboarding.practiceRecord)))
				.toBeVisible()
				.whileElement(by.id(TestIDs.onboarding.practiceScreen))
				.scroll(150, 'down');
			await tapUntilVisible(
				by.id(TestIDs.onboarding.practiceRecord),
				by.id(TestIDs.entityDetail.amountInput)
			);
			await waitFor(element(by.id(TestIDs.entityDetail.amountInput)))
				.toBeVisible()
				.withTimeout(5000);
			await tapUntilGone(
				by.id(TestIDs.entityDetail.saveButton),
				by.id(TestIDs.onboarding.practiceSheetExit)
			);
			await new Promise((resolve) => setTimeout(resolve, 400));
			await tap(TestIDs.onboarding.practiceExit);
		} finally {
			// Apply system font changes with the app stopped to avoid activity/configuration races.
			await device.terminateApp();
			setSize(before);
			await device.launchApp({ newInstance: true });
			await device.disableSynchronization();
		}
		await tap(TestIDs.dashboardTabButton);
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(10000);
	});
});
