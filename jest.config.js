/** @type {import('jest').Config} */
module.exports = {
	preset: 'jest-expo',
	// Only run component/screen tests (unit tests handled by Bun)
	testMatch: ['**/components/__tests__/**/*.test.tsx', '**/app/**/__tests__/**/*.test.tsx'],
	testPathIgnorePatterns: ['/node_modules/', '\\.worktrees/'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		// Mock expo-sqlite for component tests
		'^expo-sqlite$': '<rootDir>/src/db/__tests__/__mocks__/expo-sqlite.ts',
		'^nativewind$': '<rootDir>/src/__mocks__/nativewind.ts',
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
	collectCoverageFrom: ['src/components/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/__tests__/**'],
	transformIgnorePatterns: [
		'node_modules/(?!(expo-sqlite|react-native|react-native-safe-area-context|@react-native|react-native-reanimated|expo|expo-modules-core|@testing-library)/)',
	],
};
