import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PracticePlanForm } from '../practice-plan-form';
import { createPracticeSession, getPracticeEntities } from '@/src/onboarding/practice-session';
jest.mock('@/src/store', () => {
	throw new Error('Example plan form must not import personal state');
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
const category = getPracticeEntities(createPracticeSession('EUR')).find(
	(e) => e.id === 'practice-category'
)!;
test('uses the existing entity form, rejecting arithmetic errors and saving only the edited plan', async () => {
	const submit = jest.fn(async () => {});
	const close = jest.fn();
	const ui = render(
		<PracticePlanForm
			visible
			entity={category}
			period="2026-10"
			initialPlannedMinor={30000}
			onSubmit={submit}
			onClose={close}
		/>
	);
	expect(ui.getByText('Edit Entity')).toBeTruthy();
	expect(ui.getByTestId('entity-detail-name-input').props.editable).toBe(false);
	fireEvent.changeText(ui.getByTestId('entity-detail-amount-input'), '100÷0');
	fireEvent.press(ui.getByTestId('entity-detail-save-button'));
	await waitFor(() => expect(ui.getByRole('alert')).toBeTruthy());
	expect(submit).not.toHaveBeenCalled();
	fireEvent.changeText(ui.getByTestId('entity-detail-amount-input'), '350');
	fireEvent.press(ui.getByTestId('entity-detail-save-button'));
	await waitFor(() => expect(submit).toHaveBeenCalledWith(35000));
	expect(close).toHaveBeenCalledTimes(1);
});

test('a canceled plan save cannot close a reopened editor', async () => {
	let finish!: () => void;
	const submit = jest.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	const close = jest.fn();
	const props = {
		entity: category,
		period: '2026-10',
		initialPlannedMinor: 30000,
		onSubmit: submit,
		onClose: close,
	};
	const ui = render(<PracticePlanForm {...props} visible />);
	fireEvent.press(ui.getByTestId('entity-detail-save-button'));
	fireEvent.press(ui.getByTestId('entity-detail-save-button'));
	expect(submit).toHaveBeenCalledTimes(1);
	fireEvent.press(ui.getByTestId('entity-detail-cancel-button'));
	ui.rerender(<PracticePlanForm {...props} visible={false} />);
	ui.rerender(<PracticePlanForm {...props} visible />);
	await act(async () => finish());
	expect(close).toHaveBeenCalledTimes(1);
	expect(ui.getByTestId('entity-detail-save-button')).toBeEnabled();
	fireEvent.press(ui.getByTestId('entity-detail-save-button'));
	expect(submit).toHaveBeenCalledTimes(2);
	await act(async () => finish());
	expect(close).toHaveBeenCalledTimes(2);
});
