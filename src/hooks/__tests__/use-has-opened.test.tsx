import { renderHook } from '@testing-library/react-native';

import { useHasOpened } from '@/src/hooks/use-has-opened';

describe('useHasOpened', () => {
	it('stays false while never visible', () => {
		const { result } = renderHook(() => useHasOpened(false));
		expect(result.current).toBe(false);
	});

	it('latches true after visible is first true, and stays true after it goes false', () => {
		const { result, rerender } = renderHook(({ v }: { v: boolean }) => useHasOpened(v), {
			initialProps: { v: false },
		});
		expect(result.current).toBe(false);

		rerender({ v: true });
		expect(result.current).toBe(true);

		rerender({ v: false });
		expect(result.current).toBe(true);
	});
});
