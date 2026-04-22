import { describe, expect, mock, test } from 'bun:test';

describe('app prefs', () => {
	test('getRemindersEnabled defaults to disabled for new installs', async () => {
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

		const { getRemindersEnabled } = await import('../app-prefs');

		await expect(getRemindersEnabled()).resolves.toBe(false);
	});
});
