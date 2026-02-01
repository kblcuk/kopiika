import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import HistoryScreen from '../history';
import { useStore } from '@/src/store';
import type { Entity, Transaction } from '@/src/types';

const mockSetParams = jest.fn();
let mockParams: { period?: string; entityId?: string } = {};

jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockParams,
	useRouter: () => ({ setParams: mockSetParams }),
}));

// Track blur callback for testing cleanup behavior
let capturedBlurCallback: (() => void) | null = null;

jest.mock('@react-navigation/native', () => ({
	useFocusEffect: (createCallback: () => (() => void) | void) => {
		// Use React.useEffect to properly handle the focus effect mock
		const React = require('react');
		React.useEffect(() => {
			const cleanup = createCallback();
			if (typeof cleanup === 'function') {
				capturedBlurCallback = cleanup;
			}
			return cleanup;
		}, [createCallback]);
	},
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/components/period-picker', () => ({
	PeriodPicker: ({ period }: { period: string }) => {
		const { Text } = require('react-native');
		return <Text testID="period-picker">{period}</Text>;
	},
}));

jest.mock('@/src/components/entity-filter', () => ({
	EntityFilter: ({ selectedEntityId }: { selectedEntityId: string | null }) => {
		const { Text } = require('react-native');
		return <Text testID="entity-filter">{selectedEntityId || 'all'}</Text>;
	},
}));

jest.mock('@/src/components/transaction-row', () => ({
	TransactionRow: () => null,
}));

jest.mock('@/src/components/transaction-modal', () => ({
	TransactionModal: () => null,
}));

describe('HistoryScreen search params', () => {
	const mockAccount: Entity = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const mockCategory: Entity = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const mockTransaction: Transaction = {
		id: 'tx-1',
		from_entity_id: 'account-1',
		to_entity_id: 'category-1',
		amount: 100,
		currency: 'USD',
		timestamp: Date.now(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockParams = {};
		capturedBlurCallback = null;

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [],
			transactions: [mockTransaction],
			currentPeriod: '2026-01',
			isLoading: false,
		});
	});

	it('applies URL params on focus when navigating with params', async () => {
		mockParams = { period: '2025-12', entityId: 'category-1' };

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('period-picker').props.children).toBe('2025-12');
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});
	});

	it('uses default period when no params provided', async () => {
		mockParams = {};

		const { getByTestId } = render(<HistoryScreen />);

		await waitFor(() => {
			// Should use current period (YYYY-MM format)
			expect(getByTestId('period-picker').props.children).toMatch(/^\d{4}-\d{2}$/);
			expect(getByTestId('entity-filter').props.children).toBe('all');
		});
	});

	it('clears search params when navigating away (blur)', async () => {
		mockParams = { period: '2025-12', entityId: 'category-1' };

		const { unmount } = render(<HistoryScreen />);

		// Wait for effect to run and capture blur callback
		await waitFor(() => {
			expect(capturedBlurCallback).not.toBeNull();
		});

		// Simulate unmount/blur - the cleanup function should be called
		unmount();

		expect(mockSetParams).toHaveBeenCalledWith({ period: '', entityId: '' });
	});

	it('resets to defaults on next focus after params were cleared', async () => {
		// First render with params
		mockParams = { period: '2025-12', entityId: 'category-1' };
		const { getByTestId, unmount } = render(<HistoryScreen />);

		await waitFor(() => {
			expect(getByTestId('entity-filter').props.children).toBe('category-1');
		});

		// Unmount triggers cleanup which clears params
		unmount();
		expect(mockSetParams).toHaveBeenCalledWith({ period: '', entityId: '' });

		// Simulate returning to history via tab bar (no params)
		mockParams = {};
		const { getByTestId: getByTestId2 } = render(<HistoryScreen />);

		// Should show defaults since params were cleared
		await waitFor(() => {
			expect(getByTestId2('entity-filter').props.children).toBe('all');
			expect(getByTestId2('period-picker').props.children).toMatch(/^\d{4}-\d{2}$/);
		});
	});
});
