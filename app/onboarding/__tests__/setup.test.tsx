import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

import SetupScreen from '../setup';
import { PRESET_CHIPS, presetKey } from '@/src/onboarding/presets';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import { TestIDs } from '@/e2e/support/test-ids';
import type { EntityDraft } from '@/src/components/entity-create-modal';
import type { Entity, EntityType, Plan } from '@/src/types';

const mockReplace = jest.fn();
let mockSearchParams: { fromSettings?: string } = {};

jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace }),
	useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockAddEntity = jest.fn(async (_entity: Entity) => {});
const mockSetPlan = jest.fn(async (_plan: Plan) => {});
const mockSetAppCurrency = jest.fn(async (_code: string) => {});
let mockAppCurrency = 'EUR';

type SetupStoreSlice = {
	addEntity: typeof mockAddEntity;
	setPlan: typeof mockSetPlan;
	appCurrency: string;
	setAppCurrency: typeof mockSetAppCurrency;
};

function mockGetState(): SetupStoreSlice {
	return {
		addEntity: mockAddEntity,
		setPlan: mockSetPlan,
		appCurrency: mockAppCurrency,
		setAppCurrency: mockSetAppCurrency,
	};
}

function mockUseStore<T>(selector?: (s: SetupStoreSlice) => T): T {
	const state = mockGetState();
	return selector ? selector(state) : (state as unknown as T);
}
mockUseStore.getState = mockGetState;
mockUseStore.setState = (partial: Partial<SetupStoreSlice>) => {
	if (partial.appCurrency !== undefined) mockAppCurrency = partial.appCurrency;
};

jest.mock('@/src/store', () => ({
	useStore: mockUseStore,
}));

let modalProps: {
	visible: boolean;
	entityType: EntityType | null;
	onClose: () => void;
	onCreate?: (draft: EntityDraft) => void;
} | null = null;

jest.mock('@/src/components/entity-create-modal', () => ({
	EntityCreateModal: (props: {
		visible: boolean;
		entityType: EntityType | null;
		onClose: () => void;
		onCreate?: (draft: EntityDraft) => void;
	}) => {
		modalProps = props;
		return null;
	},
}));

jest.mock('@/src/utils/app-prefs');
const mockedSetHasCompleted = jest.mocked(setHasCompletedOnboarding);

describe('Onboarding setup screen', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSearchParams = {};
		modalProps = null;
		mockAppCurrency = 'EUR';
	});

	it('default-selects chips with defaultSelected=true', () => {
		const { getByTestId } = render(<SetupScreen />);
		const defaults = PRESET_CHIPS.filter((c) => c.defaultSelected);
		for (const chip of defaults) {
			const node = getByTestId(`onboarding-setup-chip-${presetKey(chip)}`);
			expect(node.props.accessibilityState?.selected).toBe(true);
		}
	});

	it('shows the current currency and updates it from the picker', () => {
		const { getByTestId } = render(<SetupScreen />);

		fireEvent.press(getByTestId(TestIDs.onboarding.setupCurrencyRow));
		fireEvent.press(getByTestId(TestIDs.currencyPicker.option('GBP')));

		expect(getByTestId(TestIDs.onboarding.setupCurrencyRow)).toHaveTextContent(/GBP/);
	});

	it('Continue writes selected chips + completion flag, then replaces to /(tabs)', async () => {
		const { getByTestId } = render(<SetupScreen />);
		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-continue'));
		});
		await waitFor(() => {
			const defaultCount = PRESET_CHIPS.filter((c) => c.defaultSelected).length;
			expect(mockAddEntity).toHaveBeenCalledTimes(defaultCount);
			expect(mockSetPlan).toHaveBeenCalledTimes(defaultCount);
			expect(mockedSetHasCompleted).toHaveBeenCalledWith(true);
			expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
		});
	});

	it('Skip link writes completion flag without creating entities', async () => {
		const { getByTestId } = render(<SetupScreen />);
		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-skip'));
		});
		await waitFor(() => {
			expect(mockAddEntity).not.toHaveBeenCalled();
			expect(mockSetPlan).not.toHaveBeenCalled();
			expect(mockedSetHasCompleted).toHaveBeenCalledWith(true);
			expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
		});
	});

	it('preview mode (fromSettings=true) disables chips and shows Done button', () => {
		mockSearchParams = { fromSettings: 'true' };
		const { getByTestId, getByText } = render(<SetupScreen />);
		expect(getByText(/this is what new users see/i)).toBeTruthy();
		const firstDefault = PRESET_CHIPS.find((c) => c.defaultSelected)!;
		const chipNode = getByTestId(`onboarding-setup-chip-${presetKey(firstDefault)}`);
		expect(chipNode.props.accessibilityState?.disabled).toBe(true);
		fireEvent.press(getByTestId('onboarding-setup-continue'));
		expect(mockReplace).toHaveBeenCalledWith('/(tabs)/settings');
		expect(mockAddEntity).not.toHaveBeenCalled();
	});

	it('+ Custom opens the modal with the matching entity type', () => {
		const { getByTestId } = render(<SetupScreen />);
		fireEvent.press(getByTestId('onboarding-setup-custom-category'));
		expect(modalProps?.visible).toBe(true);
		expect(modalProps?.entityType).toBe('category');
	});

	it('staged customs render as chips and commit on Continue', async () => {
		const { getByTestId, queryByTestId } = render(<SetupScreen />);
		fireEvent.press(getByTestId('onboarding-setup-custom-category'));

		act(() => {
			modalProps!.onCreate!({
				type: 'category',
				name: 'Pets',
				icon: 'cat',
				color: 'jade',
				isInvestment: false,
				plannedAmountMinor: 150000,
			});
		});

		const stagedChip = queryByTestId(/^onboarding-setup-staged-custom-/);
		expect(stagedChip).toBeTruthy();

		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-continue'));
		});
		await waitFor(() => {
			const defaultCount = PRESET_CHIPS.filter((c) => c.defaultSelected).length;
			expect(mockAddEntity).toHaveBeenCalledTimes(defaultCount + 1);
			expect(mockSetPlan).toHaveBeenCalledTimes(defaultCount + 1);
			expect(mockedSetHasCompleted).toHaveBeenCalledWith(true);
		});
		const customEntity = mockAddEntity.mock.calls
			.map((c) => c[0])
			.find((e) => e.name === 'Pets');
		expect(customEntity).toBeTruthy();
		expect(customEntity!.type).toBe('category');
		expect(customEntity!.icon).toBe('cat');
		expect(customEntity!.color).toBe('jade');
	});

	it('removing a staged custom takes it out of Continue commit', async () => {
		const { getByTestId, queryByTestId } = render(<SetupScreen />);
		fireEvent.press(getByTestId('onboarding-setup-custom-saving'));
		act(() => {
			modalProps!.onCreate!({
				type: 'saving',
				name: 'Yacht',
				icon: 'sailboat',
				color: 'sapphire',
				isInvestment: false,
				plannedAmountMinor: null,
			});
		});
		const stagedChip = queryByTestId(/^onboarding-setup-staged-custom-/);
		expect(stagedChip).toBeTruthy();
		fireEvent.press(stagedChip!);
		expect(queryByTestId(/^onboarding-setup-staged-custom-/)).toBeNull();

		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-continue'));
		});
		await waitFor(() => {
			const defaultCount = PRESET_CHIPS.filter((c) => c.defaultSelected).length;
			expect(mockAddEntity).toHaveBeenCalledTimes(defaultCount);
		});
		const yacht = mockAddEntity.mock.calls.map((c) => c[0]).find((e) => e.name === 'Yacht');
		expect(yacht).toBeFalsy();
	});

	it('Skip link drops staged customs without committing', async () => {
		const { getByTestId } = render(<SetupScreen />);
		fireEvent.press(getByTestId('onboarding-setup-custom-account'));
		act(() => {
			modalProps!.onCreate!({
				type: 'account',
				name: 'Swiss Bank',
				icon: 'landmark',
				color: 'sapphire',
				isInvestment: false,
				plannedAmountMinor: null,
			});
		});
		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-skip'));
		});
		await waitFor(() => {
			expect(mockAddEntity).not.toHaveBeenCalled();
			expect(mockedSetHasCompleted).toHaveBeenCalledWith(true);
		});
	});
});
