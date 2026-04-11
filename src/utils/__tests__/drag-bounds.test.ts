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

	it('applies hysteresis on Y axis (top/bottom edges)', () => {
		// Near top edge, wasFixed=false — should stay draggable
		const nearTop = shouldUseFixedOrderMode({
			x: bounds.x + bounds.width / 2,
			y: bounds.y - 6,
			bounds,
			wasFixed: false,
		});
		expect(nearTop).toBe(false);

		// Clearly above bounds → fixed
		const aboveBounds = shouldUseFixedOrderMode({
			x: bounds.x + bounds.width / 2,
			y: bounds.y - 20,
			bounds,
			wasFixed: false,
		});
		expect(aboveBounds).toBe(true);

		// Near bottom edge inside, wasFixed=true — should stay fixed
		const nearBottom = shouldUseFixedOrderMode({
			x: bounds.x + bounds.width / 2,
			y: bounds.y + bounds.height - 4,
			bounds,
			wasFixed: true,
		});
		expect(nearBottom).toBe(true);

		// Clearly inside from bottom → draggable
		const insideFromBottom = shouldUseFixedOrderMode({
			x: bounds.x + bounds.width / 2,
			y: bounds.y + bounds.height - 20,
			bounds,
			wasFixed: true,
		});
		expect(insideFromBottom).toBe(false);
	});

	it('handles corners — both axes must satisfy hysteresis', () => {
		// Just outside top-left corner, wasFixed=false
		const cornerOutside = shouldUseFixedOrderMode({
			x: bounds.x - 6,
			y: bounds.y - 6,
			bounds,
			wasFixed: false,
		});
		// Only one axis is slightly outside (within hysteresis) → still draggable
		expect(cornerOutside).toBe(false);

		// Clearly outside both axes
		const cornerFarOutside = shouldUseFixedOrderMode({
			x: bounds.x - 20,
			y: bounds.y - 20,
			bounds,
			wasFixed: false,
		});
		expect(cornerFarOutside).toBe(true);
	});
});
