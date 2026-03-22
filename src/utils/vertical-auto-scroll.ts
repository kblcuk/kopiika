import { Dimensions } from 'react-native';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { remeasureAllDropZones } from './drop-zone';

// Edge zone size in px — auto-scroll triggers when touch enters this region
const EDGE_ZONE = 80;
// Max scroll speed in px per frame at the very edge of the screen
const MAX_SPEED = 14;

let scrollViewRef: RefObject<ScrollView | null> | null = null;
let scrollOffset = 0;
let maxScrollOffset = 0;
let isActive = false;
let lastTouch = { x: 0, y: 0 };
let remeasureScheduled = false;

export function setVerticalScrollTarget(ref: RefObject<ScrollView | null>) {
	scrollViewRef = ref;
}

export function updateScrollMetrics(offset: number, contentHeight: number, layoutHeight: number) {
	scrollOffset = offset;
	maxScrollOffset = Math.max(0, contentHeight - layoutHeight);
}

export function updateDragTouch(x: number, y: number) {
	lastTouch = { x, y };
}

export function startVerticalAutoScroll() {
	if (isActive) return;
	isActive = true;
	requestAnimationFrame(tick);
}

export function stopVerticalAutoScroll() {
	isActive = false;
}

function tick() {
	if (!isActive || !scrollViewRef?.current) return;

	const screenHeight = Dimensions.get('window').height;
	let speed = 0;

	if (lastTouch.y > screenHeight - EDGE_ZONE) {
		const proximity = (lastTouch.y - (screenHeight - EDGE_ZONE)) / EDGE_ZONE;
		speed = MAX_SPEED * Math.min(proximity, 1);
	} else if (lastTouch.y < EDGE_ZONE) {
		const proximity = (EDGE_ZONE - lastTouch.y) / EDGE_ZONE;
		speed = -MAX_SPEED * Math.min(proximity, 1);
	}

	if (speed !== 0) {
		const newOffset = Math.max(0, Math.min(maxScrollOffset, scrollOffset + speed));
		if (newOffset !== scrollOffset) {
			scrollOffset = newOffset;
			scrollViewRef.current.scrollTo({ y: newOffset, animated: false });

			// Throttle remeasure to ~100ms so drop zones track the new scroll position
			if (!remeasureScheduled) {
				remeasureScheduled = true;
				setTimeout(() => {
					remeasureAllDropZones();
					remeasureScheduled = false;
				}, 100);
			}
		}
	}

	requestAnimationFrame(tick);
}
