import { mock } from 'bun:test';

// react-native/index.js uses Flow syntax that bun cannot parse.
// Provide a minimal mock so util tests that depend on RN APIs can run.
mock.module('react-native', () => ({
	Dimensions: {
		get: () => ({ height: 800, width: 400, scale: 1, fontScale: 1 }),
	},
	Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
}));

// expo-notifications pulls in expo/async-require which needs __DEV__.
// Mock the whole module so the store can import notification helpers.
mock.module('expo-notifications', () => ({
	getPermissionsAsync: async () => ({ status: 'granted' }),
	requestPermissionsAsync: async () => ({ status: 'granted' }),
	setNotificationChannelAsync: async () => {},
	scheduleNotificationAsync: async () => 'mock-notification-id',
	cancelScheduledNotificationAsync: async () => {},
	cancelAllScheduledNotificationsAsync: async () => {},
	setBadgeCountAsync: async () => {},
	AndroidImportance: { DEFAULT: 3 },
	SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// expo-task-manager and expo-background-fetch are used by background-task.ts.
mock.module('expo-task-manager', () => ({
	defineTask: () => {},
	isTaskRegisteredAsync: async () => false,
}));

mock.module('expo-background-fetch', () => ({
	registerTaskAsync: async () => {},
	unregisterTaskAsync: async () => {},
	BackgroundFetchResult: { NewData: 1, NoData: 2, Failed: 3 },
}));

// expo-file-system is used by app-prefs — provide no-op FS stubs.
mock.module('expo-file-system', () => {
	class MockFile {
		exists = false;
		async text() {
			return '{}';
		}
		write() {}
	}
	return { File: MockFile, Paths: { document: '/tmp' } };
});

// Polyfill browser/RN globals missing in bun's test environment
if (typeof globalThis.requestAnimationFrame === 'undefined') {
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
		setTimeout(cb, 0) as unknown as number;
	globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}
