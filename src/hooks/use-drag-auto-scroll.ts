// src/hooks/use-drag-auto-scroll.ts
import { useCallback } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
	useAnimatedRef,
	useAnimatedScrollHandler,
	useFrameCallback,
	useSharedValue,
	useScrollOffset,
	scrollTo,
	runOnJS,
} from 'react-native-reanimated';

import { computeEdgeSpeed, SECTION_COUNT } from '@/src/utils/drag-auto-scroll';
import { remeasureAllDropZones } from '@/src/utils/drop-zone';

// Vertical constants
const V_EDGE_ZONE = 80;
const V_MAX_SPEED = 14;

// Horizontal constants (gentler — shorter scroll distances)
const H_EDGE_ZONE = 60;
const H_MAX_SPEED = 10;

const REMEASURE_THROTTLE_MS = 100;

export function useDragAutoScroll() {
	// --- Outer (vertical) scroll ---
	const outerScrollRef = useAnimatedRef<Animated.ScrollView>();
	const scrollOffset = useSharedValue(0);
	const contentHeight = useSharedValue(0);
	const layoutHeight = useSharedValue(0);

	// --- Section (horizontal) scroll ---
	const sectionRef0 = useAnimatedRef<Animated.ScrollView>();
	const sectionRef1 = useAnimatedRef<Animated.ScrollView>();
	const sectionRef2 = useAnimatedRef<Animated.ScrollView>();
	const sectionRef3 = useAnimatedRef<Animated.ScrollView>();
	const sectionRefs = [sectionRef0, sectionRef1, sectionRef2, sectionRef3];

	// Auto-tracked horizontal offsets (UI thread).
	const sectionOffset0 = useScrollOffset(sectionRef0);
	const sectionOffset1 = useScrollOffset(sectionRef1);
	const sectionOffset2 = useScrollOffset(sectionRef2);
	const sectionOffset3 = useScrollOffset(sectionRef3);

	// Max horizontal offset per section (contentWidth - visibleWidth).
	// Individual SharedValues to avoid read-modify-write race (same as bounds).
	const sectionMaxH0 = useSharedValue(0);
	const sectionMaxH1 = useSharedValue(0);
	const sectionMaxH2 = useSharedValue(0);
	const sectionMaxH3 = useSharedValue(0);

	// Section Y bounds — individual SharedValues to avoid read-modify-write
	// race when multiple grids fire onLayout simultaneously.
	// Content-relative coords (screenY + outerScrollOffset at measurement time).
	const sectionTop0 = useSharedValue(0);
	const sectionBot0 = useSharedValue(0);
	const sectionTop1 = useSharedValue(0);
	const sectionBot1 = useSharedValue(0);
	const sectionTop2 = useSharedValue(0);
	const sectionBot2 = useSharedValue(0);
	const sectionTop3 = useSharedValue(0);
	const sectionBot3 = useSharedValue(0);

	// --- Drag state ---
	const touchX = useSharedValue(0);
	const touchY = useSharedValue(0);
	const dragSourceIndex = useSharedValue(-1);
	const remeasurePending = useSharedValue(false);

	const screenHeight = Dimensions.get('window').height;
	const screenWidth = Dimensions.get('window').width;

	// Throttled remeasure — runs on JS thread
	const doRemeasure = useCallback(() => {
		remeasureAllDropZones();
		setTimeout(() => {
			remeasurePending.value = false;
		}, REMEASURE_THROTTLE_MS);
	}, [remeasurePending]);

	// --- Worklet helpers (avoid dynamic array indexing of SharedValues) ---

	function getSectionOffset(i: number): number {
		'worklet';
		switch (i) {
			case 0:
				return sectionOffset0.value;
			case 1:
				return sectionOffset1.value;
			case 2:
				return sectionOffset2.value;
			case 3:
				return sectionOffset3.value;
			default:
				return 0;
		}
	}

	function getSectionBounds(i: number): { top: number; bot: number } {
		'worklet';
		switch (i) {
			case 0:
				return { top: sectionTop0.value, bot: sectionBot0.value };
			case 1:
				return { top: sectionTop1.value, bot: sectionBot1.value };
			case 2:
				return { top: sectionTop2.value, bot: sectionBot2.value };
			case 3:
				return { top: sectionTop3.value, bot: sectionBot3.value };
			default:
				return { top: 0, bot: 0 };
		}
	}

	function getSectionMaxOffset(i: number): number {
		'worklet';
		switch (i) {
			case 0:
				return sectionMaxH0.value;
			case 1:
				return sectionMaxH1.value;
			case 2:
				return sectionMaxH2.value;
			case 3:
				return sectionMaxH3.value;
			default:
				return 0;
		}
	}

	function scrollSectionTo(i: number, x: number): void {
		'worklet';
		switch (i) {
			case 0:
				scrollTo(sectionRef0, x, 0, false);
				break;
			case 1:
				scrollTo(sectionRef1, x, 0, false);
				break;
			case 2:
				scrollTo(sectionRef2, x, 0, false);
				break;
			case 3:
				scrollTo(sectionRef3, x, 0, false);
				break;
		}
	}

	// --- UI-thread tick ---

	const frameCallback = useFrameCallback(() => {
		'worklet';
		let scrolled = false;

		// 1. Vertical scroll (outer ScrollView)
		const vMaxOffset = Math.max(0, contentHeight.value - layoutHeight.value);
		const vSpeed = computeEdgeSpeed(touchY.value, screenHeight, V_EDGE_ZONE, V_MAX_SPEED);

		if (vSpeed !== 0) {
			const currentV = scrollOffset.value;
			const newV = Math.max(0, Math.min(vMaxOffset, currentV + vSpeed));
			if (Math.abs(newV - currentV) >= 1) {
				scrollTo(outerScrollRef, 0, newV, false);
				scrollOffset.value = newV;
				scrolled = true;
			}
		}

		// 2. Horizontal scroll (hovered target section)
		const srcIdx = dragSourceIndex.value;
		if (srcIdx >= 0) {
			const hSpeed = computeEdgeSpeed(touchX.value, screenWidth, H_EDGE_ZONE, H_MAX_SPEED);
			if (hSpeed !== 0) {
				const currentScrollY = scrollOffset.value;
				for (let i = 0; i < SECTION_COUNT; i++) {
					if (i === srcIdx) continue;
					const b = getSectionBounds(i);
					// Convert content-relative bounds to screen-space
					const screenTop = b.top - currentScrollY;
					const screenBottom = b.bot - currentScrollY;
					if (screenBottom <= screenTop) continue; // not measured yet
					if (touchY.value >= screenTop && touchY.value <= screenBottom) {
						const maxH = getSectionMaxOffset(i);
						if (maxH <= 0) break;
						const currentH = getSectionOffset(i);
						const newH = Math.max(0, Math.min(maxH, currentH + hSpeed));
						if (Math.abs(newH - currentH) >= 1) {
							scrollSectionTo(i, newH);
							scrolled = true;
						}
						break; // only scroll one section
					}
				}
			}
		}

		// 3. Remeasure drop zones if anything scrolled
		if (scrolled && !remeasurePending.value) {
			remeasurePending.value = true;
			runOnJS(doRemeasure)();
		}
	}, false); // autostart: false

	const startAutoScroll = useCallback(() => {
		frameCallback.setActive(true);
	}, [frameCallback]);

	const stopAutoScroll = useCallback(() => {
		frameCallback.setActive(false);
		dragSourceIndex.value = -1;
	}, [frameCallback, dragSourceIndex]);

	const updateDragTouch = useCallback(
		(x: number, y: number) => {
			touchX.value = x;
			touchY.value = y;
		},
		[touchX, touchY]
	);

	const setDragSourceIndex = useCallback(
		(index: number) => {
			dragSourceIndex.value = index;
		},
		[dragSourceIndex]
	);

	// Each section writes its own SharedValues — no read-modify-write race.
	const boundSetters = [
		{ top: sectionTop0, bot: sectionBot0 },
		{ top: sectionTop1, bot: sectionBot1 },
		{ top: sectionTop2, bot: sectionBot2 },
		{ top: sectionTop3, bot: sectionBot3 },
	];

	const updateSectionBounds = useCallback(
		(index: number, screenY: number, height: number) => {
			const contentY = screenY + scrollOffset.value;
			boundSetters[index].top.value = contentY;
			boundSetters[index].bot.value = contentY + height;
		},
		// boundSetters is stable (refs don't change), scrollOffset is a SharedValue
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[scrollOffset]
	);

	const maxOffsetSetters = [sectionMaxH0, sectionMaxH1, sectionMaxH2, sectionMaxH3];

	const updateSectionMaxOffset = useCallback(
		(index: number, contentWidth: number, visibleWidth: number) => {
			maxOffsetSetters[index].value = Math.max(0, contentWidth - visibleWidth);
		},
		// maxOffsetSetters is stable (SharedValues don't change identity)
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	// Captures outer scroll metrics on UI thread
	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (event) => {
			scrollOffset.value = event.contentOffset.y;
			contentHeight.value = event.contentSize.height;
			layoutHeight.value = event.layoutMeasurement.height;
		},
	});

	// Capture initial outer scroll metrics before any scroll event fires.
	// Without this, contentHeight/layoutHeight stay 0 and vertical scroll
	// is clamped to 0 until the user manually scrolls.
	const handleOuterLayout = useCallback(
		(e: { nativeEvent: { layout: { height: number } } }) => {
			if (layoutHeight.value === 0) {
				layoutHeight.value = e.nativeEvent.layout.height;
			}
		},
		[layoutHeight]
	);

	const handleOuterContentSizeChange = useCallback(
		(_w: number, h: number) => {
			if (contentHeight.value === 0) {
				contentHeight.value = h;
			}
		},
		[contentHeight]
	);

	return {
		outerScrollRef,
		scrollHandler,
		handleOuterLayout,
		handleOuterContentSizeChange,
		startAutoScroll,
		stopAutoScroll,
		updateDragTouch,
		sectionRefs,
		setDragSourceIndex,
		updateSectionBounds,
		updateSectionMaxOffset,
	};
}
