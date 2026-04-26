import { execSync } from 'child_process';
import { device } from 'detox';

// Retry only failed tests instead of rerunning the entire suite.
jest.retryTimes(1);

// Re-enable Android animations after every launchApp() so test actions are visible.
// Must be done in beforeAll (not at module level) — Detox worker is ready by then.
beforeAll(() => {
	const original = device.launchApp.bind(device);
	(device as any).launchApp = async (...args: Parameters<typeof device.launchApp>) => {
		await original(...args);
		if (device.getPlatform() === 'android') {
			try {
				execSync('adb shell settings put global window_animation_scale 0.5');
				execSync('adb shell settings put global transition_animation_scale 0.5');
				execSync('adb shell settings put global animator_duration_scale 0.5');
			} catch {}
		}
	};
});
