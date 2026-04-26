module.exports = {
	rootDir: '..',
	testMatch: ['<rootDir>/e2e/tests/**/*.test.ts'],
	testTimeout: 120000,
	maxWorkers: 1,
	globalSetup: 'detox/runners/jest/globalSetup',
	globalTeardown: 'detox/runners/jest/globalTeardown',
	reporters: ['detox/runners/jest/reporter'],
	testEnvironment: 'detox/runners/jest/testEnvironment',
	verbose: true,
	setupFilesAfterEnv: ['<rootDir>/e2e/support/animationSetup.ts'],
};
