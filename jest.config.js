/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		'^expo-sqlite$': '<rootDir>/src/db/__tests__/__mocks__/expo-sqlite.ts',
		'^react-native$': '<rootDir>/node_modules/react-native',
		'^react-native-reanimated$': '<rootDir>/node_modules/react-native-reanimated/mock.js',
	},
	collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/__tests__/**'],
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				tsconfig: {
					jsx: 'react',
					esModuleInterop: true,
					allowSyntheticDefaultImports: true,
				},
			},
		],
	},
	transformIgnorePatterns: [
		'node_modules/(?!(expo-sqlite|react-native|@react-native|react-native-reanimated|expo)/)',
	],
};
