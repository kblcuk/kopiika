import { getPracticeGestureCue } from '../practice-gesture';
const viewport = { x: 10, y: 100, width: 390, height: 500 };
const from = { x: 30, y: 120, width: 100, height: 80 };
const to = { x: 30, y: 240, width: 100, height: 80 };

test('cue coordinates follow actual bubble centers relative to the visible board', () => {
	expect(getPracticeGestureCue(from, to, viewport)).toEqual({
		fromX: 70,
		fromY: 60,
		toX: 70,
		toY: 180,
	});
});
test('a scrolled-off source uses instructions instead of an invisible animation', () => {
	expect(getPracticeGestureCue({ ...from, y: 50 }, to, viewport)).toBeNull();
});
test('an offscreen destination uses instructions instead of an invisible animation', () => {
	expect(getPracticeGestureCue(from, { ...to, y: 570 }, viewport)).toBeNull();
});
test('a destination clipped horizontally cannot be demonstrated', () => {
	expect(getPracticeGestureCue(from, { ...to, x: 370 }, viewport)).toBeNull();
});
