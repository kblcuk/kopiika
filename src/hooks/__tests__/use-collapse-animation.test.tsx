import { act, renderHook } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import { UNCLAMPED, useCollapseAnimation } from '@/src/hooks/use-collapse-animation';
import { remeasureAllDropZones } from '@/src/utils/drop-zone';

// The mocked `useAnimatedStyle` can only snapshot the style at render time,
// where the real one re-evaluates on the UI thread whenever the shared value
// moves. So a *target* height is asserted through `withTiming`'s arguments, and
// the style is only asserted for what a render can actually show.
jest.mock('react-native-reanimated', () => {
	const React = jest.requireActual<typeof import('react')>('react');
	return {
		__esModule: true,
		// Keep one object per hook instance, like the real shared value — a fresh
		// object per render would silently discard writes made from an effect.
		useSharedValue: <T,>(val: T) => React.useRef({ value: val }).current,
		// Run the completion callback synchronously so tests can observe the
		// post-animation state without faking the UI thread.
		withTiming: jest.fn(<T,>(val: T, _config: unknown, cb?: (finished: boolean) => void) => {
			cb?.(true);
			return val;
		}),
		useAnimatedStyle: (fn: () => unknown) => fn(),
		Easing: { out: () => (x: number) => x, cubic: (x: number) => x },
	};
});

jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));

jest.mock('@/src/utils/drop-zone', () => ({ remeasureAllDropZones: jest.fn() }));

const layout = (height: number) => ({ nativeEvent: { layout: { height } } });

describe('useCollapseAnimation', () => {
	let queue: FrameRequestCallback[];
	let rafSpy: jest.SpyInstance;
	let cafSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
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

	const flushFrames = () =>
		act(() => {
			const cbs = queue;
			queue = [];
			cbs.forEach((cb) => cb(0));
		});

	it('leaves an expanded section unclamped so it cannot clip or go stale', () => {
		const { result } = renderHook(() => useCollapseAnimation(false));

		expect(result.current.animatedStyle).toEqual({ maxHeight: UNCLAMPED, overflow: 'visible' });
	});

	it('clamps a section collapsed at mount to zero height', () => {
		const { result } = renderHook(() => useCollapseAnimation(true));

		expect(result.current.animatedStyle).toEqual({ maxHeight: 0, overflow: 'hidden' });
	});

	it('animates to zero height on collapse and remeasures drop zones', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: false },
			}
		);

		act(() => result.current.onContentLayout(layout(120)));
		rerender({ collapsed: true });

		// Clamped to the measured height for one frame, so the shrink has a
		// starting point and the section does not blink shut.
		expect(result.current.animatedStyle).toEqual({ maxHeight: 120, overflow: 'hidden' });

		flushFrames();

		expect(jest.mocked(withTiming)).toHaveBeenLastCalledWith(
			0,
			expect.anything(),
			expect.any(Function)
		);
		expect(remeasureAllDropZones).toHaveBeenCalled();
	});

	// Expand has to commit a render clamped to the collapsed height *before* it
	// animates, exactly as collapse does. Without that committed numeric height
	// the animation has no rendered starting point, and the section only appears
	// when the settle finally re-renders it — an expand with no animation.
	it('clamps to the collapsed height in a committed render before animating open', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: false },
			}
		);

		act(() => result.current.onContentLayout(layout(240)));
		rerender({ collapsed: true });
		flushFrames();

		jest.mocked(withTiming).mockClear();
		rerender({ collapsed: false });

		// Still constrained, clamped at the collapsed height — no animation yet.
		expect(result.current.animatedStyle).toEqual({ maxHeight: 0, overflow: 'hidden' });
		expect(jest.mocked(withTiming)).not.toHaveBeenCalled();

		flushFrames();

		expect(jest.mocked(withTiming)).toHaveBeenCalledWith(
			240,
			expect.anything(),
			expect.any(Function)
		);
	});

	it('releases the clamp once the expand animation finishes', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: false },
			}
		);

		act(() => result.current.onContentLayout(layout(120)));
		rerender({ collapsed: true });
		flushFrames();
		rerender({ collapsed: false });
		// The expand animation starts a frame later, and the fake completes it
		// synchronously, so this lands on the settled state.
		flushFrames();

		expect(result.current.animatedStyle).toEqual({ maxHeight: UNCLAMPED, overflow: 'visible' });
	});

	// Reanimated pushes only the keys a style currently returns and never resets
	// the ones it drops — `updateProps` merges into the shadow node
	// (UpdatePropsManager.update → global._updateProps). A style that stopped
	// returning `maxHeight` would leave the collapsed `maxHeight: 0` applied forever,
	// so the section could be collapsed once and never reopened.
	it('always returns a clamp, so a collapsed clamp is never left applied', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: false },
			}
		);

		const keysOf = () => Object.keys(result.current.animatedStyle as object).sort();
		const expanded = keysOf();

		act(() => result.current.onContentLayout(layout(120)));
		rerender({ collapsed: true });
		flushFrames();
		const collapsedKeys = keysOf();

		rerender({ collapsed: false });
		flushFrames();

		expect(expanded).toContain('maxHeight');
		expect(collapsedKeys).toEqual(expanded);
		expect(keysOf()).toEqual(expanded);
	});

	it('expands instantly when the section launched collapsed and was never measured', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: true },
			}
		);

		rerender({ collapsed: false });
		flushFrames();

		expect(result.current.animatedStyle).toEqual({ maxHeight: UNCLAMPED, overflow: 'visible' });
		expect(remeasureAllDropZones).toHaveBeenCalled();
	});

	// A clipped container does not report height 0 — it reports a sub-pixel
	// positive height. Accepting that would overwrite the real content height, and
	// the next expand would animate to ~0: invisible, finishing immediately, with
	// the content only appearing when the clamp is finally released.
	it('ignores layout reported while the container is clipped', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: false },
			}
		);

		act(() => result.current.onContentLayout(layout(240)));
		rerender({ collapsed: true });
		flushFrames();

		// Layout pass while collapsed: clipped, so this height is meaningless.
		act(() => result.current.onContentLayout(layout(0.33)));

		jest.mocked(withTiming).mockClear();
		rerender({ collapsed: false });
		flushFrames();

		expect(jest.mocked(withTiming)).toHaveBeenCalledWith(
			240,
			expect.anything(),
			expect.any(Function)
		);
	});

	it('re-measures on every layout so a later collapse uses the current height', () => {
		const { result, rerender } = renderHook(
			({ collapsed }: { collapsed: boolean }) => useCollapseAnimation(collapsed),
			{
				initialProps: { collapsed: false },
			}
		);

		act(() => result.current.onContentLayout(layout(120)));
		act(() => result.current.onContentLayout(layout(240)));
		rerender({ collapsed: true });

		// Before the animation frame runs, the container is pinned to the most
		// recent measurement — not the first one ever taken.
		expect(result.current.animatedStyle).toEqual({ maxHeight: 240, overflow: 'hidden' });
	});
});
