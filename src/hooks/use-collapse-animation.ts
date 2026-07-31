import { useCallback, useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { remeasureAllDropZones } from '@/src/utils/drop-zone';

// A clamp high enough to never bind, used as the released state. `maxHeight` must
// stay in the style in every branch — see the note on the animated style below.
export const UNCLAMPED = 100000;

const TIMING = { duration: 250, easing: Easing.out(Easing.cubic) };

export interface UseCollapseAnimation {
	/** Style for the container wrapping the collapsible content. */
	animatedStyle: StyleProp<ViewStyle>;
	/** Attach to the content view so the measured height stays current. */
	onContentLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;
}

/**
 * Drives a collapse/expand animation for one board section by animating a
 * `maxHeight` clamp over the content.
 *
 * Three states, not two: collapsed (clamped to 0), animating (timed clamp), and
 * expanded-and-settled — where the clamp is raised out of the way so the
 * container is naturally sized. That third state is why the container can
 * neither pin itself to a stale measurement nor clip a scaled-up bubble
 * mid-drag, both of which the income-only predecessor had to work around.
 */
export function useCollapseAnimation(collapsed: boolean): UseCollapseAnimation {
	// Content height as last measured while expanded. Read only when a
	// transition starts, so updating it must not trigger a render.
	const contentHeightRef = useRef<number | null>(null);
	// 'collapsed' and 'animating' both pin the height; 'settled' releases it.
	// They are distinct states so that *entering* an animation is always a real
	// state change, and therefore always commits a render — see the effect.
	const [phase, setPhase] = useState<'collapsed' | 'animating' | 'settled'>(
		collapsed ? 'collapsed' : 'settled'
	);
	const constrained = phase !== 'settled';
	const height = useSharedValue(0);
	const isFirstRun = useRef(true);

	const onContentLayout = useCallback(
		(event: { nativeEvent: { layout: { height: number } } }) => {
			// Only a settled container reports the content's natural height. While
			// collapsed or mid-animation the parent clips the content, and RN reports
			// a near-zero height — *not* exactly 0, but a sub-pixel value, so a
			// `> 0` check does not filter it out. Storing it would overwrite the real
			// height and the next expand would animate to nothing: invisible, over in
			// an instant, with the content only appearing once the settle applies
			// `height: 'auto'`.
			if (phase !== 'settled') return;
			const measured = event.nativeEvent.layout.height;
			if (measured > 0) contentHeightRef.current = measured;
		},
		[phase]
	);

	// Sections below shift whenever this one opens or closes.
	const finishCollapse = useCallback(() => {
		setPhase('collapsed');
		remeasureAllDropZones();
	}, []);

	const finishExpand = useCallback(() => {
		setPhase('settled');
		remeasureAllDropZones();
	}, []);

	useEffect(() => {
		// Mount: `phase` already matches `collapsed`, nothing to animate.
		if (isFirstRun.current) {
			isFirstRun.current = false;
			return;
		}

		// Both directions follow the same two steps, and the order matters. First
		// pin the height this animation starts *from* and enter 'animating', which
		// is always a real state change and so always commits a render carrying
		// that numeric height. Only then, on the next frame, start the animation.
		// Animating in the same tick gives it no rendered starting point — the
		// section would jump to the end value instead of travelling to it.
		const from = collapsed ? (contentHeightRef.current ?? 0) : 0;
		const to = collapsed ? 0 : contentHeightRef.current;

		if (to === null) {
			// Expanding a section that launched collapsed: its content was never
			// measured, so there is no distance to animate over. Release straight
			// to natural height; every later toggle animates.
			const frame = requestAnimationFrame(finishExpand);
			return () => cancelAnimationFrame(frame);
		}

		height.value = from;
		setPhase('animating');

		const frame = requestAnimationFrame(() => {
			height.value = withTiming(to, TIMING, (finished) => {
				'worklet';
				if (finished) scheduleOnRN(collapsed ? finishCollapse : finishExpand);
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [collapsed, height, finishCollapse, finishExpand]);

	// `maxHeight`, not `height`. Animating `height` makes the section *close*
	// smoothly but snap open: measured on device, the shared value travels 0 → 436
	// across the full duration while the rendered height is full from the first
	// frame, so nothing about the animation is visible. The section content is a
	// `Sortable.Grid`, and react-native-sortables drives its own container height
	// with `withTiming` (SortableContainer.tsx) — two layers writing the same
	// dimension. A clamp is not a dimension either layer sets, so it wins, and it
	// reveals the content progressively in both directions.
	//
	// Both branches must return the *same* keys. Reanimated pushes only the keys a
	// style currently returns and never resets the ones it drops (updateProps →
	// UpdatePropsManager.update merges into the shadow node), so a released state
	// that omitted the clamp would leave `maxHeight: 0` applied for good and the
	// section could never reopen. Hence UNCLAMPED rather than no key.
	//
	// Clamping also beats pinning a measured height: content taller than the last
	// measurement still shows in full once released, and a bubble scaled up
	// mid-drag has nothing to clip it.
	const animatedStyle = useAnimatedStyle(
		() =>
			constrained
				? { maxHeight: height.value, overflow: 'hidden' }
				: { maxHeight: UNCLAMPED, overflow: 'visible' },
		[constrained]
	);

	return { animatedStyle, onContentLayout };
}
