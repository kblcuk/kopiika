import { act, renderHook } from '@testing-library/react-native';

import { useStaggeredReveal } from '@/src/hooks/use-staggered-reveal';

describe('useStaggeredReveal', () => {
	let queue: FrameRequestCallback[];
	let rafSpy: jest.SpyInstance;
	let cafSpy: jest.SpyInstance;

	beforeEach(() => {
		queue = [];
		rafSpy = jest
			.spyOn(global, 'requestAnimationFrame')
			.mockImplementation((cb: FrameRequestCallback) => {
				queue.push(cb);
				return queue.length as unknown as number;
			});
		cafSpy = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
	});

	afterEach(() => {
		rafSpy.mockRestore();
		cafSpy.mockRestore();
	});

	// Run every queued frame callback, letting the effect schedule the next one.
	const flushFrame = () =>
		act(() => {
			const cbs = queue;
			queue = [];
			cbs.forEach((cb) => cb(0));
		});

	it('starts at 0 and reveals one section per frame up to total', () => {
		const { result } = renderHook(() => useStaggeredReveal(2));
		expect(result.current).toBe(0);

		flushFrame();
		expect(result.current).toBe(1);

		flushFrame();
		expect(result.current).toBe(2);
	});

	it('stops scheduling frames once total is reached', () => {
		renderHook(() => useStaggeredReveal(2));
		flushFrame(); // 0 -> 1
		flushFrame(); // 1 -> 2
		expect(queue.length).toBe(0);
	});

	it('cancels the pending frame on unmount', () => {
		const { unmount } = renderHook(() => useStaggeredReveal(2));
		unmount();
		expect(cafSpy).toHaveBeenCalled();
	});
});
