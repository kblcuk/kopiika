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

jest.mock('@/src/utils/app-prefs');
jest.mock('@/src/store', () => ({
	useStore: (selector?: any) => {
		const state = {
			isLoading: false,
			entities: (global as any).__testEntities ?? [],
		};
		return selector ? selector(state) : state;
	},
}));

const mockedGetHasCompletedOnboarding = getHasCompletedOnboarding as jest.Mock;
const mockedSetHasCompletedOnboarding = setHasCompletedOnboarding as jest.Mock;

describe('Root layout first-launch detection', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(global as any).__testEntities = [];
	});

	it('does nothing when hasCompletedOnboarding=true', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(true);
		(global as any).__testEntities = [{ id: 'a', type: 'account' }];
		renderHook(() => useMigrateOnboarding(true));
		// Wait for the read to happen first — proves the async body ran
		await waitFor(() => expect(mockedGetHasCompletedOnboarding).toHaveBeenCalledTimes(1));
		// Now the negative assertion is meaningful
		expect(mockedSetHasCompletedOnboarding).not.toHaveBeenCalled();
	});

	it('migrates existing users (entities>0, flag false) to true', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		(global as any).__testEntities = [
			{ id: BALANCE_ADJUSTMENT_ENTITY_ID, type: 'account' },
			{ id: 'real-entity', type: 'account' },
		];
		renderHook(() => useMigrateOnboarding(true));
		await waitFor(() => {
			expect(mockedSetHasCompletedOnboarding).toHaveBeenCalledWith(true);
		});
	});

	it('does NOT migrate when only system entity exists', async () => {
		mockedGetHasCompletedOnboarding.mockResolvedValue(false);
		(global as any).__testEntities = [{ id: BALANCE_ADJUSTMENT_ENTITY_ID, type: 'account' }];
		renderHook(() => useMigrateOnboarding(true));
		// Wait for the read to happen first — proves the async body ran
		await waitFor(() => expect(mockedGetHasCompletedOnboarding).toHaveBeenCalledTimes(1));
		// Now the negative assertion is meaningful
		expect(mockedSetHasCompletedOnboarding).not.toHaveBeenCalled();
	});
});
