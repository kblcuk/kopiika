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
	};
});

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
