import { describe, expect, it } from 'bun:test';

import {
	actionForGesture,
	isBubbleGestureMode,
	modeForGestureAction,
	type BubbleGesture,
	type BubbleGestureMode,
} from '../bubble-gestures';

const MODES: BubbleGestureMode[] = ['tap-adds', 'tap-opens-history'];
const GESTURES: BubbleGesture[] = ['tap', 'longPress'];

describe('actionForGesture', () => {
	it('maps tap-adds to add on tap and history on long press', () => {
		expect(actionForGesture('tap-adds', 'tap')).toBe('add');
		expect(actionForGesture('tap-adds', 'longPress')).toBe('history');
	});

	it('maps tap-opens-history to history on tap and add on long press', () => {
		expect(actionForGesture('tap-opens-history', 'tap')).toBe('history');
		expect(actionForGesture('tap-opens-history', 'longPress')).toBe('add');
	});

	it('never assigns the same action to both gestures', () => {
		for (const mode of MODES) {
			expect(actionForGesture(mode, 'tap')).not.toBe(actionForGesture(mode, 'longPress'));
		}
	});
});

describe('modeForGestureAction', () => {
	it('round-trips every gesture/mode pair', () => {
		for (const mode of MODES) {
			for (const gesture of GESTURES) {
				expect(modeForGestureAction(gesture, actionForGesture(mode, gesture))).toBe(mode);
			}
		}
	});

	it('lets either picker select the same mode', () => {
		expect(modeForGestureAction('tap', 'history')).toBe('tap-opens-history');
		expect(modeForGestureAction('longPress', 'add')).toBe('tap-opens-history');
		expect(modeForGestureAction('tap', 'add')).toBe('tap-adds');
		expect(modeForGestureAction('longPress', 'history')).toBe('tap-adds');
	});
});

describe('isBubbleGestureMode', () => {
	it('accepts the two known modes', () => {
		expect(isBubbleGestureMode('tap-adds')).toBe(true);
		expect(isBubbleGestureMode('tap-opens-history')).toBe(true);
	});

	it('rejects anything else, including a stale or corrupt pref value', () => {
		expect(isBubbleGestureMode('tap-does-something-else')).toBe(false);
		expect(isBubbleGestureMode(undefined)).toBe(false);
		expect(isBubbleGestureMode(null)).toBe(false);
		expect(isBubbleGestureMode(true)).toBe(false);
	});
});
