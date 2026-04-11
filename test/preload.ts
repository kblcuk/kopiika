import { mock } from 'bun:test';

// react-native/index.js uses Flow syntax that bun cannot parse.
// Provide a minimal mock so util tests that depend on RN APIs can run.
mock.module('react-native', () => ({
	Dimensions: {
		get: () => ({ height: 800, width: 400, scale: 1, fontScale: 1 }),
	},
}));

// Polyfill browser/RN globals missing in bun's test environment
if (typeof globalThis.requestAnimationFrame === 'undefined') {
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
		setTimeout(cb, 0) as unknown as number;
	globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}
