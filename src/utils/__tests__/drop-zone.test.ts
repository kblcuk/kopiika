import { expect, test } from 'bun:test';
import { createDropZoneRegistry } from '../drop-zone';

test('independent boards cannot find each other’s drop targets', () => {
	const personal = createDropZoneRegistry();
	const practice = createDropZoneRegistry();
	personal.registerDropZone('real-account', { x: 0, y: 0, width: 100, height: 100 });
	practice.registerDropZone('example', { x: 0, y: 0, width: 100, height: 100 });
	expect(practice.findDropTarget(50, 50, 'source')).toBe('example');
	practice.unregisterDropZone('example');
	expect(practice.findDropTarget(50, 50, 'source')).toBeNull();
	expect(personal.findDropTarget(50, 50, 'source')).toBe('real-account');
});

test('remeasure and teardown affect only the owning board', () => {
	const a = createDropZoneRegistry();
	const b = createDropZoneRegistry();
	let countA = 0;
	let countB = 0;
	a.registerRemeasureCallback('grid', () => countA++);
	b.registerRemeasureCallback('grid', () => countB++);
	a.remeasureAllDropZones();
	expect([countA, countB]).toEqual([1, 0]);
	a.unregisterRemeasureCallback('grid');
	a.remeasureAllDropZones();
	b.remeasureAllDropZones();
	expect([countA, countB]).toEqual([1, 1]);
});
