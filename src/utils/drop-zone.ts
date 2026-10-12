import type { LayoutRectangle } from 'react-native';

export function createDropZoneRegistry() {
	// Global registry for drop zones
	const dropZoneRegistry = new Map<string, LayoutRectangle>();

	// Registry for remeasure callbacks
	const remeasureCallbacks = new Map<string, () => void>();

	function registerDropZone(id: string, layout: LayoutRectangle) {
		dropZoneRegistry.set(id, layout);
	}

	function unregisterDropZone(id: string) {
		dropZoneRegistry.delete(id);
		remeasureCallbacks.delete(id);
	}

	function registerRemeasureCallback(id: string, callback: () => void) {
		remeasureCallbacks.set(id, callback);
	}

	function unregisterRemeasureCallback(id: string) {
		remeasureCallbacks.delete(id);
	}

	// Call this when scroll position changes to update all drop zone positions
	function remeasureAllDropZones() {
		remeasureCallbacks.forEach((callback) => callback());
	}

	// Optimized drop target detection with early exit
	function findDropTarget(x: number, y: number, excludeId: string): string | null {
		for (const [id, layout] of dropZoneRegistry) {
			if (id === excludeId) continue;
			// Early exit optimizations: check simple conditions first
			if (x < layout.x || x > layout.x + layout.width) continue;
			if (y < layout.y || y > layout.y + layout.height) continue;
			return id;
		}
		return null;
	}

	return {
		registerDropZone,
		unregisterDropZone,
		registerRemeasureCallback,
		unregisterRemeasureCallback,
		remeasureAllDropZones,
		findDropTarget,
		getDropZone: (id: string) => dropZoneRegistry.get(id),
	};
}

/** The dashboard's app-wide registry; practice boards create their own. */
export const globalDropZones = createDropZoneRegistry();
export const { remeasureAllDropZones } = globalDropZones;
