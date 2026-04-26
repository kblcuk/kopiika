import { describe, expect, mock, test } from 'bun:test';

describe('app prefs', () => {
	test('getRemindersEnabled defaults to disabled for new installs', async () => {
		void mock.module('expo-file-system', () => {
			class MockFile {
				exists = false;
				async text() {
					return '{}';
				}
				write() {}
			}

			return { File: MockFile, Paths: { document: '/tmp' } };
		});

		const { getRemindersEnabled } = await import('../app-prefs');

		expect(getRemindersEnabled()).resolves.toBe(false);
	});
});
