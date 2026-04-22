jest.mock('react-native-safe-area-context', () => ({
	...jest.requireActual('react-native-safe-area-context'),
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
	useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
	SafeAreaProvider: ({ children }) => children,
	SafeAreaView: ({ children }) => children,
}));

jest.mock('react-native-keyboard-controller', () => {
	const { ScrollView } = require('react-native');
	return {
		KeyboardAwareScrollView: ScrollView,
		KeyboardExtender: 'KeyboardExtender',
		KeyboardProvider: ({ children }) => children,
		KeyboardController: { dismiss: jest.fn() },
	};
});

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-notifications', () => ({
	getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
	requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
	setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
	scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
	cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
	cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
	setBadgeCountAsync: jest.fn().mockResolvedValue(undefined),
	AndroidImportance: { DEFAULT: 3 },
	SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-task-manager', () => ({
	defineTask: jest.fn(),
	isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('expo-background-task', () => ({
	registerTaskAsync: jest.fn().mockResolvedValue(undefined),
	unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
	BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

jest.mock('expo-file-system', () => {
	class MockFile {
		exists = false;
		async text() {
			return '{}';
		}
		write() {}
	}

	return { File: MockFile, Paths: { document: '/tmp' } };
});
