import type { LayoutRectangle } from 'react-native';

/** A demo must stay inside the visible board; otherwise the guidance explains scrolling. */
export function getPracticeGestureCue(
	from: LayoutRectangle,
	to: LayoutRectangle,
	viewport: LayoutRectangle
) {
	const visible = (rect: LayoutRectangle) =>
		rect.width > 0 &&
		rect.height > 0 &&
		viewport.width > 0 &&
		viewport.height > 0 &&
		rect.x >= viewport.x &&
		rect.y >= viewport.y &&
		rect.x + rect.width <= viewport.x + viewport.width &&
		rect.y + rect.height <= viewport.y + viewport.height;
	if (!visible(from) || !visible(to)) return null;
	return {
		fromX: from.x + from.width / 2 - viewport.x,
		fromY: from.y + from.height / 2 - viewport.y,
		toX: to.x + to.width / 2 - viewport.x,
		toY: to.y + to.height / 2 - viewport.y,
	};
}
