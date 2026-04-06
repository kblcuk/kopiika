import {
	registerDropZone,
	unregisterDropZone,
	findDropTarget,
	registerRemeasureCallback,
	unregisterRemeasureCallback,
	remeasureAllDropZones,
} from '../drop-zone';

// Each test starts with a clean registry
afterEach(() => {
	// Unregister everything used in tests
	['a', 'b', 'c', 'big', 'left', 'right', 'cb-1', 'cb-2'].forEach((id) => unregisterDropZone(id));
	['cb-1', 'cb-2'].forEach((id) => unregisterRemeasureCallback(id));
});

describe('findDropTarget', () => {
	it('returns the id of the zone containing the point', () => {
		registerDropZone('a', { x: 0, y: 0, width: 100, height: 100 });
		expect(findDropTarget(50, 50, '')).toBe('a');
	});

	it('returns null when point is outside all zones', () => {
		registerDropZone('a', { x: 0, y: 0, width: 100, height: 100 });
		expect(findDropTarget(200, 200, '')).toBeNull();
	});

	it('excludes the dragged item from hit testing', () => {
		registerDropZone('a', { x: 0, y: 0, width: 100, height: 100 });
		expect(findDropTarget(50, 50, 'a')).toBeNull();
	});

	it('returns the first matching zone when zones overlap', () => {
		registerDropZone('a', { x: 0, y: 0, width: 100, height: 100 });
		registerDropZone('b', { x: 50, y: 50, width: 100, height: 100 });
		expect(findDropTarget(75, 75, '')).toBe('a');
	});

	it('hits zone edges (inclusive bounds)', () => {
		registerDropZone('a', { x: 10, y: 10, width: 80, height: 80 });
		// top-left corner
		expect(findDropTarget(10, 10, '')).toBe('a');
		// bottom-right corner
		expect(findDropTarget(90, 90, '')).toBe('a');
		// just outside
		expect(findDropTarget(9, 10, '')).toBeNull();
		expect(findDropTarget(91, 10, '')).toBeNull();
	});

	it('falls through excluded zone to next matching zone', () => {
		registerDropZone('a', { x: 0, y: 0, width: 100, height: 100 });
		registerDropZone('b', { x: 0, y: 0, width: 100, height: 100 });
		expect(findDropTarget(50, 50, 'a')).toBe('b');
	});
});

describe('registry lifecycle', () => {
	it('register then unregister removes the zone', () => {
		registerDropZone('a', { x: 0, y: 0, width: 50, height: 50 });
		expect(findDropTarget(25, 25, '')).toBe('a');

		unregisterDropZone('a');
		expect(findDropTarget(25, 25, '')).toBeNull();
	});

	it('re-registering updates the layout', () => {
		registerDropZone('a', { x: 0, y: 0, width: 50, height: 50 });
		expect(findDropTarget(75, 75, '')).toBeNull();

		registerDropZone('a', { x: 50, y: 50, width: 50, height: 50 });
		expect(findDropTarget(75, 75, '')).toBe('a');
		expect(findDropTarget(25, 25, '')).toBeNull();
	});
});

describe('remeasure callbacks', () => {
	it('remeasureAllDropZones invokes all registered callbacks', () => {
		const cb1 = jest.fn();
		const cb2 = jest.fn();
		registerRemeasureCallback('cb-1', cb1);
		registerRemeasureCallback('cb-2', cb2);

		remeasureAllDropZones();

		expect(cb1).toHaveBeenCalledTimes(1);
		expect(cb2).toHaveBeenCalledTimes(1);
	});

	it('unregisterRemeasureCallback prevents future invocations', () => {
		const cb = jest.fn();
		registerRemeasureCallback('cb-1', cb);
		unregisterRemeasureCallback('cb-1');

		remeasureAllDropZones();

		expect(cb).not.toHaveBeenCalled();
	});

	it('unregisterDropZone also removes remeasure callback for that id', () => {
		const cb = jest.fn();
		registerRemeasureCallback('a', cb);
		registerDropZone('a', { x: 0, y: 0, width: 10, height: 10 });

		unregisterDropZone('a');
		remeasureAllDropZones();

		expect(cb).not.toHaveBeenCalled();
	});
});
