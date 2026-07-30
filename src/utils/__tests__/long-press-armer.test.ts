import { describe, test, expect, jest, beforeEach, afterEach } from 'bun:test';

import { createLongPressArmer, ARM_DELAY_MS, MOVE_TOLERANCE_PX } from '../long-press-armer';

describe('createLongPressArmer', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	function armer(onArm = () => {}) {
		return createLongPressArmer({ delayMs: 100, tolerancePx: 10, onArm });
	}

	test('arms after delayMs and end() reports armed', () => {
		const onArm = jest.fn();
		const a = armer(onArm);

		a.start();
		expect(onArm).not.toHaveBeenCalled();

		jest.advanceTimersByTime(100);
		expect(onArm).toHaveBeenCalledTimes(1);
		expect(a.end()).toBe(true);
	});

	test('end() before delayMs reports not armed and never calls onArm', () => {
		const onArm = jest.fn();
		const a = armer(onArm);

		a.start();
		jest.advanceTimersByTime(99);

		expect(a.end()).toBe(false);
		expect(onArm).not.toHaveBeenCalled();
	});

	test('movement beyond tolerance before arming cancels the timer', () => {
		const onArm = jest.fn();
		const a = armer(onArm);

		a.start();
		a.move(100, 100);
		a.move(100, 130);
		jest.advanceTimersByTime(100);

		expect(onArm).not.toHaveBeenCalled();
		expect(a.end()).toBe(false);
	});

	test('movement beyond tolerance after arming still disarms', () => {
		const onArm = jest.fn();
		const a = armer(onArm);

		a.start();
		a.move(100, 100);
		jest.advanceTimersByTime(100);
		expect(onArm).toHaveBeenCalledTimes(1);

		a.move(140, 100);

		expect(a.end()).toBe(false);
	});

	test('jitter within tolerance keeps it armed', () => {
		const a = armer();

		a.start();
		a.move(100, 100);
		a.move(104, 103);
		jest.advanceTimersByTime(100);
		a.move(103, 106);

		expect(a.end()).toBe(true);
	});

	test('first move only records the origin, however large the coordinates', () => {
		const a = armer();

		a.start();
		a.move(900, 1200);
		jest.advanceTimersByTime(100);

		expect(a.end()).toBe(true);
	});

	test('cancel() prevents a pending onArm', () => {
		const onArm = jest.fn();
		const a = armer(onArm);

		a.start();
		a.cancel();
		jest.advanceTimersByTime(100);

		expect(onArm).not.toHaveBeenCalled();
	});

	test('start() resets state from a previous disarmed gesture', () => {
		const onArm = jest.fn();
		const a = armer(onArm);

		a.start();
		a.move(100, 100);
		a.move(200, 100);
		expect(a.end()).toBe(false);

		a.start();
		a.move(100, 100);
		jest.advanceTimersByTime(100);

		expect(onArm).toHaveBeenCalledTimes(1);
		expect(a.end()).toBe(true);
	});

	test('end() resets, so a second end() without start() reports not armed', () => {
		const a = armer();

		a.start();
		jest.advanceTimersByTime(100);
		expect(a.end()).toBe(true);
		expect(a.end()).toBe(false);
	});

	test('exports the spec timing constants', () => {
		expect(ARM_DELAY_MS).toBe(450);
		expect(MOVE_TOLERANCE_PX).toBe(10);
	});
});
