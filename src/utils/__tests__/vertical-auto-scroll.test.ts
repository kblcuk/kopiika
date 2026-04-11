// react-native is mocked via test/preload.ts (Dimensions.get → height: 800)
import { mock, jest, describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';

const SCREEN_HEIGHT = 800;

mock.module('../drop-zone', () => ({
	remeasureAllDropZones: jest.fn(),
}));

// oxlint-disable-next-line eslint-plugin-import(first) -- mock.module must precede the import it intercepts
import {
	setVerticalScrollTarget,
	updateScrollMetrics,
	updateDragTouch,
	startVerticalAutoScroll,
	stopVerticalAutoScroll,
} from '../vertical-auto-scroll';

// Capture RAF callbacks for manual tick control
let rafCallbacks: (() => void)[] = [];
let rafId = 0;
spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
	rafCallbacks.push(cb as () => void);
	return ++rafId;
});

function flushRAF() {
	const cbs = rafCallbacks.splice(0);
	cbs.forEach((cb) => cb());
}

describe('vertical-auto-scroll', () => {
	let mockScrollTo: ReturnType<typeof jest.fn>;

	beforeEach(() => {
		jest.clearAllMocks();
		rafCallbacks = [];
		rafId = 0;

		mockScrollTo = jest.fn();
		setVerticalScrollTarget({ current: { scrollTo: mockScrollTo } } as any);
		updateScrollMetrics(0, 2000, SCREEN_HEIGHT);
		stopVerticalAutoScroll();
	});

	afterEach(() => {
		stopVerticalAutoScroll();
	});

	it('does not scroll when not started', () => {
		updateDragTouch(200, SCREEN_HEIGHT - 10);
		flushRAF();
		expect(mockScrollTo).not.toHaveBeenCalled();
	});

	it('scrolls after start and stops after stop', () => {
		updateDragTouch(200, SCREEN_HEIGHT - 10);
		startVerticalAutoScroll();
		flushRAF();
		expect(mockScrollTo).toHaveBeenCalled();

		mockScrollTo.mockClear();
		stopVerticalAutoScroll();
		flushRAF();
		expect(mockScrollTo).not.toHaveBeenCalled();
	});

	it('does not scroll when touch is in the middle of the screen', () => {
		updateDragTouch(200, SCREEN_HEIGHT / 2);
		startVerticalAutoScroll();
		flushRAF();
		expect(mockScrollTo).not.toHaveBeenCalled();
	});

	it('scrolls down when touch enters bottom edge zone', () => {
		updateDragTouch(200, SCREEN_HEIGHT - 40);
		startVerticalAutoScroll();
		flushRAF();

		const { y } = mockScrollTo.mock.calls[0][0];
		expect(y).toBeGreaterThan(0);
	});

	it('scrolls up when touch enters top edge zone', () => {
		updateScrollMetrics(500, 2000, SCREEN_HEIGHT);
		updateDragTouch(200, 40);
		startVerticalAutoScroll();
		flushRAF();

		const { y } = mockScrollTo.mock.calls[0][0];
		expect(y).toBeLessThan(500);
	});

	it('does not scroll past content bounds', () => {
		// Near bottom: offset=1195, max=1200, speed would push to 1209
		updateScrollMetrics(1195, 2000, SCREEN_HEIGHT);
		updateDragTouch(200, SCREEN_HEIGHT);
		startVerticalAutoScroll();
		flushRAF();
		expect(mockScrollTo.mock.calls[0][0].y).toBe(1200);

		// Near top: offset=5, speed would push to -9
		mockScrollTo.mockClear();
		stopVerticalAutoScroll();
		updateScrollMetrics(5, 2000, SCREEN_HEIGHT);
		updateDragTouch(200, 0);
		startVerticalAutoScroll();
		flushRAF();
		expect(mockScrollTo.mock.calls[0][0].y).toBe(0);
	});
});
