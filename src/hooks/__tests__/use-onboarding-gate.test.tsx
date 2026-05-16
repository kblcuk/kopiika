/**
 * Regression tests for the (tabs) layout onboarding gate.
 *
 * The bug we lock in here: the original implementation kept `entities` in the
 * effect dependency array, so any entity mutation after the initial decision
 * (e.g. the user deleting their last account) could flip the gate from
 * 'show-tabs' to 'redirect' and pull them out of the app mid-session.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { useOnboardingGate } from '@/src/hooks/use-onboarding-gate';
import { getHasCompletedOnboarding } from '@/src/utils/app-prefs';
import type { Entity } from '@/src/types';

let mockState = { isLoading: false, entities: [] as Entity[] };

jest.mock('@/src/utils/app-prefs');

jest.mock('@/src/store', () => {
	const useStore = <T,>(selector?: (s: typeof mockState) => T) =>
		selector ? selector(mockState) : (mockState as unknown as T);
	useStore.getState = () => mockState;
	return { useStore };
});

const mockedGetHasCompletedOnboarding = jest.mocked(getHasCompletedOnboarding);

const realEntity = (id = 'a'): Entity => ({ id, type: 'account' }) as Entity;

describe('useOnboardingGate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockState = { isLoading: false, entities: [] };
	});

	it('redirects on fresh install (no completion flag, no entities)', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		const { result } = renderHook(() => useOnboardingGate());
		await waitFor(() => expect(result.current).toBe('redirect'));
	});

	it('shows tabs when completion flag is set', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(true);
		const { result } = renderHook(() => useOnboardingGate());
		await waitFor(() => expect(result.current).toBe('show-tabs'));
	});

	it('shows tabs for existing users (entities present, flag unset)', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		mockState = { isLoading: false, entities: [realEntity()] };
		const { result } = renderHook(() => useOnboardingGate());
		await waitFor(() => expect(result.current).toBe('show-tabs'));
	});

	it('ignores the balance-adjustment system entity when deciding', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		mockState = {
			isLoading: false,
			entities: [{ id: BALANCE_ADJUSTMENT_ENTITY_ID, type: 'account' } as Entity],
		};
		const { result } = renderHook(() => useOnboardingGate());
		await waitFor(() => expect(result.current).toBe('redirect'));
	});

	it('does not re-evaluate gate when entities change after initial decision', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(true);
		mockState = { isLoading: false, entities: [realEntity()] };
		const { result, rerender } = renderHook((_tick: number) => useOnboardingGate(), {
			initialProps: 0,
		});
		await waitFor(() => expect(result.current).toBe('show-tabs'));
		expect(mockedGetHasCompletedOnboarding).toHaveBeenCalledTimes(1);

		// User deletes their last entity mid-session. Gate must NOT flip.
		act(() => {
			mockState = { isLoading: false, entities: [] };
		});
		rerender(1);

		expect(result.current).toBe('show-tabs');
		expect(mockedGetHasCompletedOnboarding).toHaveBeenCalledTimes(1);
	});

	it('waits for hydration before deciding', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		mockState = { isLoading: true, entities: [] };
		const { result, rerender } = renderHook((_tick: number) => useOnboardingGate(), {
			initialProps: 0,
		});
		expect(result.current).toBe('unknown');
		expect(mockedGetHasCompletedOnboarding).not.toHaveBeenCalled();

		act(() => {
			mockState = { isLoading: false, entities: [realEntity()] };
		});
		rerender(1);
		await waitFor(() => expect(result.current).toBe('show-tabs'));
	});
});
