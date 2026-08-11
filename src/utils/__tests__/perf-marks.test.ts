import { describe, expect, test, spyOn, afterEach } from 'bun:test';
import { markPerf, isPerfEnabled } from '../perf-marks';

describe('perf-marks', () => {
	afterEach(() => {
		// restore all spies
		(console.info as ReturnType<typeof spyOn>).mockRestore?.();
	});

	test('is enabled outside production (bun test runs with NODE_ENV=test)', () => {
		expect(isPerfEnabled()).toBe(true);
	});

	test('logs label, absolute offset, and delta in the [perf] format', () => {
		const info = spyOn(console, 'info').mockImplementation(() => {});
		markPerf('hydrate:phase1');
		expect(info).toHaveBeenCalledTimes(1);
		expect(info.mock.calls[0]?.[0]).toMatch(/^\[perf\] hydrate:phase1 \+\d+ms \(Δ\d+ms\)$/);
	});

	test('appends extra detail after the timing', () => {
		const info = spyOn(console, 'info').mockImplementation(() => {});
		markPerf('hydrate:phase1', '120 rows');
		expect(info.mock.calls[0]?.[0]).toMatch(
			/^\[perf\] hydrate:phase1 \+\d+ms \(Δ\d+ms\) 120 rows$/
		);
	});
});
