import { mock } from 'bun:test';

// react-native/index.js uses Flow syntax that bun cannot parse.
// Provide a minimal mock so util tests that depend on RN APIs can run.
void mock.module('react-native', () => ({
	Dimensions: {
		get: () => ({ height: 800, width: 400, scale: 1, fontScale: 1 }),
	},
	Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
}));

// expo-notifications pulls in expo/async-require which needs __DEV__.
// Mock the whole module so the store can import notification helpers.
void mock.module('expo-notifications', () => ({
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

// expo-task-manager and expo-background-task are used by background-task.ts.
void mock.module('expo-task-manager', () => ({
	defineTask: () => {},
	isTaskRegisteredAsync: async () => false,
}));

void mock.module('expo-background-task', () => ({
	registerTaskAsync: async () => {},
	unregisterTaskAsync: async () => {},
	BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

// expo-crypto wraps the native UUID generator; in bun tests we delegate to
// Node's crypto.randomUUID so generateId() produces a real UUID.
void mock.module('expo-crypto', () => ({
	randomUUID: () => crypto.randomUUID(),
}));

// expo-sharing is used by export.ts — provide no-op stubs.
void mock.module('expo-sharing', () => ({
	isAvailableAsync: async () => false,
	shareAsync: async () => {},
}));

// expo-file-system is used by app-prefs and export.ts — provide no-op FS stubs.
void mock.module('expo-file-system', () => {
	const fileContents = new Map<string, string>();

	class MockFile {
		path: string;

		constructor(...parts: string[]) {
			this.path = parts.join('/');
		}

		get exists() {
			return fileContents.has(this.path);
		}

		async text() {
			return fileContents.get(this.path) ?? '{}';
		}

		write(content: string) {
			fileContents.set(this.path, content);
		}
	}
	class MockDirectory {
		path: string;

		constructor(...parts: string[]) {
			this.path = parts.join('/');
		}

		get exists() {
			return false;
		}

		create(_opts?: unknown) {}
	}

	return {
		File: MockFile,
		Directory: MockDirectory,
		Paths: { document: '/tmp', cache: '/tmp/cache' },
	};
});

// Polyfill browser/RN globals missing in bun's test environment
if (typeof globalThis.requestAnimationFrame === 'undefined') {
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
		setTimeout(cb, 0) as unknown as number;
	globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}
