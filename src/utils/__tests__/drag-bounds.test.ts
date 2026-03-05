import { shouldUseFixedOrderMode } from '../drag-bounds';

describe('shouldUseFixedOrderMode', () => {
	const bounds = { x: 100, y: 200, width: 96, height: 128 };

	it('keeps draggable mode near edge until pointer is clearly outside', () => {
		const nearRightEdge = shouldUseFixedOrderMode({
			x: bounds.x + bounds.width + 6,
			y: bounds.y + bounds.height / 2,
			bounds,
			wasFixed: false,
		});
		expect(nearRightEdge).toBe(false);

		const clearlyOutside = shouldUseFixedOrderMode({
			x: bounds.x + bounds.width + 20,
			y: bounds.y + bounds.height / 2,
			bounds,
			wasFixed: false,
		});
		expect(clearlyOutside).toBe(true);
	});

	it('keeps fixed mode until pointer moves clearly back inside', () => {
		const nearLeftEdgeInside = shouldUseFixedOrderMode({
			x: bounds.x + 4,
			y: bounds.y + bounds.height / 2,
			bounds,
			wasFixed: true,
		});
		expect(nearLeftEdgeInside).toBe(true);

		const clearlyInside = shouldUseFixedOrderMode({
			x: bounds.x + 20,
			y: bounds.y + bounds.height / 2,
			bounds,
			wasFixed: true,
		});
		expect(clearlyInside).toBe(false);
	});

	it('clamps hysteresis for very small bounds', () => {
		const smallBounds = { x: 0, y: 0, width: 10, height: 10 };
		const result = shouldUseFixedOrderMode({
			x: 5,
			y: 5,
			bounds: smallBounds,
			wasFixed: true,
			hysteresisPx: 20,
		});
		expect(result).toBe(false);
	});
});
