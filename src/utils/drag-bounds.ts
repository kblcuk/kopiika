import type { LayoutRectangle } from 'react-native';

const DEFAULT_HYSTERESIS_PX = 12;

function isWithinBounds(
	x: number,
	y: number,
	bounds: LayoutRectangle,
	marginX: number,
	marginY: number
): boolean {
	return (
		x >= bounds.x + marginX &&
		x <= bounds.x + bounds.width - marginX &&
		y >= bounds.y + marginY &&
		y <= bounds.y + bounds.height - marginY
	);
}

export type FixedOrderModeInput = {
	x: number;
	y: number;
	bounds: LayoutRectangle;
	wasFixed: boolean;
	hysteresisPx?: number;
};

/**
 * Prevents rapid mode flipping near grid bounds by using hysteresis:
 * - Draggable -> fixed requires moving outside an expanded boundary
 * - Fixed -> draggable requires moving back inside a contracted boundary
 */
export function shouldUseFixedOrderMode({
	x,
	y,
	bounds,
	wasFixed,
	hysteresisPx = DEFAULT_HYSTERESIS_PX,
}: FixedOrderModeInput): boolean {
	const clampedMarginX = Math.min(hysteresisPx, bounds.width / 2);
	const clampedMarginY = Math.min(hysteresisPx, bounds.height / 2);

	if (wasFixed) {
		const isClearlyInside = isWithinBounds(x, y, bounds, clampedMarginX, clampedMarginY);
		return !isClearlyInside;
	}

	const isClearlyOutside = !isWithinBounds(x, y, bounds, -clampedMarginX, -clampedMarginY);
	return isClearlyOutside;
}
