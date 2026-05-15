import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { EmptyBoardNudge } from '../empty-board-nudge';
import { getEmptyBoardNudgeDismissed, setEmptyBoardNudgeDismissed } from '@/src/utils/app-prefs';

jest.mock('@/src/utils/app-prefs');

const mockedGet = getEmptyBoardNudgeDismissed as jest.Mock;
const mockedSet = setEmptyBoardNudgeDismissed as jest.Mock;

describe('EmptyBoardNudge', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedGet.mockResolvedValue(false);
	});

	it('renders no-entities copy when entityCount=0', async () => {
		const { findByText } = render(
			<EmptyBoardNudge entityCount={0} transactionCount={0} onAddEntity={() => {}} />
		);
		expect(await findByText(/start by adding your first account/i)).toBeTruthy();
	});

	it('renders has-entities-no-tx copy when entityCount>0 and transactionCount=0', async () => {
		const { findByText } = render(
			<EmptyBoardNudge entityCount={3} transactionCount={0} onAddEntity={() => {}} />
		);
		expect(await findByText(/drag an income onto an account/i)).toBeTruthy();
	});

	it('renders nothing when transactions exist', async () => {
		const { toJSON } = render(
			<EmptyBoardNudge entityCount={3} transactionCount={1} onAddEntity={() => {}} />
		);
		await waitFor(() => expect(mockedGet).toHaveBeenCalled());
		expect(toJSON()).toBeNull();
	});

	it('renders nothing when persisted dismissed flag is true', async () => {
		mockedGet.mockResolvedValue(true);
		const { toJSON } = render(
			<EmptyBoardNudge entityCount={3} transactionCount={0} onAddEntity={() => {}} />
		);
		await waitFor(() => expect(mockedGet).toHaveBeenCalled());
		expect(toJSON()).toBeNull();
	});

	it('writes the dismissed flag when ✕ is tapped', async () => {
		const { findByTestId } = render(
			<EmptyBoardNudge entityCount={3} transactionCount={0} onAddEntity={() => {}} />
		);
		fireEvent.press(await findByTestId('empty-board-nudge-dismiss'));
		await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(true));
	});

	it('calls onAddEntity when no-entities CTA is tapped', async () => {
		const onAddEntity = jest.fn();
		const { findByTestId } = render(
			<EmptyBoardNudge entityCount={0} transactionCount={0} onAddEntity={onAddEntity} />
		);
		fireEvent.press(await findByTestId('empty-board-nudge-add-entity'));
		expect(onAddEntity).toHaveBeenCalled();
	});
});
