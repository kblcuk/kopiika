import { LayoutRectangle } from 'react-native';

// Global registry for drop zones
const dropZoneRegistry = new Map<string, LayoutRectangle>();

// Registry for remeasure callbacks
const remeasureCallbacks = new Map<string, () => void>();

export function registerDropZone(id: string, layout: LayoutRectangle) {
	dropZoneRegistry.set(id, layout);
}

export function unregisterDropZone(id: string) {
	dropZoneRegistry.delete(id);
	remeasureCallbacks.delete(id);
}

export function registerRemeasureCallback(id: string, callback: () => void) {
	remeasureCallbacks.set(id, callback);
}

export function unregisterRemeasureCallback(id: string) {
	remeasureCallbacks.delete(id);
}

// Call this when scroll position changes to update all drop zone positions
export function remeasureAllDropZones() {
	remeasureCallbacks.forEach((callback) => callback());
}

// Optimized drop target detection with early exit
export function findDropTarget(x: number, y: number, excludeId: string): string | null {
	for (const [id, layout] of dropZoneRegistry) {
		if (id === excludeId) continue;
		// Early exit optimizations: check simple conditions first
		if (x < layout.x || x > layout.x + layout.width) continue;
		if (y < layout.y || y > layout.y + layout.height) continue;
		return id;
	}
	return null;
}
