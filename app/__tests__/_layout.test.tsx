/**
 * Tests for the onboarding migration behaviour that runs in _layout.tsx.
 *
 * The migration logic lives in useMigrateOnboarding (called from _layout.tsx).
 * Testing it via renderHook avoids the heavy native dependencies that _layout
 * drags in (gesture handler, drizzle studio, etc.) while still exercising the
 * exact code path used in production.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { getHasCompletedOnboarding, setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { useMigrateOnboarding } from '@/src/hooks/use-migrate-onboarding';
import type { Entity } from '@/src/types';

let mockEntities: Entity[] = [];

jest.mock('@/src/utils/app-prefs');
jest.mock('@/src/store', () => ({
	useStore: <T,>(selector?: (s: { isLoading: boolean; entities: Entity[] }) => T) => {
		const state = { isLoading: false, entities: mockEntities };
		return selector ? selector(state) : state;
	},
}));

const mockedGetHasCompletedOnboarding = jest.mocked(getHasCompletedOnboarding);
const mockedSetHasCompletedOnboarding = jest.mocked(setHasCompletedOnboarding);

describe('Root layout first-launch detection', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockEntities = [];
	});

	it('does nothing when hasCompletedOnboarding=true', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(true);
		mockEntities = [{ id: 'a', type: 'account' } as Entity];
		renderHook(() => useMigrateOnboarding(true));
		// Wait for the read to happen first — proves the async body ran
		await waitFor(() => expect(mockedGetHasCompletedOnboarding).toHaveBeenCalledTimes(1));
		// Now the negative assertion is meaningful
		expect(mockedSetHasCompletedOnboarding).not.toHaveBeenCalled();
	});

	it('migrates existing users (entities>0, flag false) to true', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		mockEntities = [
			{ id: BALANCE_ADJUSTMENT_ENTITY_ID, type: 'account' } as Entity,
			{ id: 'real-entity', type: 'account' } as Entity,
		];
		renderHook(() => useMigrateOnboarding(true));
		await waitFor(() => {
			expect(mockedSetHasCompletedOnboarding).toHaveBeenCalledWith(true);
		});
	});

	it('does NOT migrate when only system entity exists', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		mockEntities = [{ id: BALANCE_ADJUSTMENT_ENTITY_ID, type: 'account' } as Entity];
		renderHook(() => useMigrateOnboarding(true));
		// Wait for the read to happen first — proves the async body ran
		await waitFor(() => expect(mockedGetHasCompletedOnboarding).toHaveBeenCalledTimes(1));
		// Now the negative assertion is meaningful
		expect(mockedSetHasCompletedOnboarding).not.toHaveBeenCalled();
	});

	it('does NOT migrate when no completion + no entities (fresh install)', async () => {
		// Fresh install branch: hook leaves the flag untouched; the (tabs)
		// layout gate handles the actual redirect into /onboarding/welcome.
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		mockEntities = [];
		renderHook(() => useMigrateOnboarding(true));
		await waitFor(() => expect(mockedGetHasCompletedOnboarding).toHaveBeenCalled());
		expect(mockedSetHasCompletedOnboarding).not.toHaveBeenCalled();
	});
});
