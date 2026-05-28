import React from 'react';
import { render } from '@testing-library/react-native';

import { ProgressBar } from '../progress-bar';
import { colors } from '@/src/theme/colors';

const TRACK_TEST_ID = 'progress-bar-track';
const FILL_TEST_ID = 'progress-bar-fill';

function getFillWidth(getByTestId: (id: string) => any): string | number {
	const fill = getByTestId(FILL_TEST_ID);
	const style = Array.isArray(fill.props.style)
		? Object.assign({}, ...fill.props.style)
		: fill.props.style;
	return style.width;
}

function getTrackBackground(getByTestId: (id: string) => any): string | undefined {
	const track = getByTestId(TRACK_TEST_ID);
	const style = Array.isArray(track.props.style)
		? Object.assign({}, ...track.props.style)
		: track.props.style;
	return style?.backgroundColor;
}

describe('ProgressBar', () => {
	describe('minimum visible fill', () => {
		it('renders at least 2% width when actual > 0 but planned makes it tiny', () => {
			// 100/8000 → 1.25% — should be bumped to 2%
			const { getByTestId } = render(<ProgressBar progress={1.25} planned={8000} />);
			const width = getFillWidth(getByTestId);
			expect(width).toBe('2%');
		});

		it('renders true 0% when progress is exactly 0 (no activity)', () => {
			const { getByTestId } = render(<ProgressBar progress={0} planned={8000} />);
			const width = getFillWidth(getByTestId);
			expect(width).toBe('0%');
		});

		it('renders normal width when progress is well above the minimum', () => {
			const { getByTestId } = render(<ProgressBar progress={45} planned={100} />);
			const width = getFillWidth(getByTestId);
			expect(width).toBe('45%');
		});

		it('clamps overspending to 100%', () => {
			const { getByTestId } = render(<ProgressBar progress={150} planned={100} />);
			const width = getFillWidth(getByTestId);
			expect(width).toBe('100%');
		});

		it('respects min fill when planned is 0 (neutral state with activity)', () => {
			// hasNoPlan + positive progress → neutral; still want a sliver
			const { getByTestId } = render(<ProgressBar progress={0.5} planned={0} />);
			const width = getFillWidth(getByTestId);
			expect(width).toBe('2%');
		});
	});

	describe('state-aware track colors', () => {
		it('uses healthy-tinted track for healthy state', () => {
			const { getByTestId } = render(<ProgressBar progress={20} planned={100} />);
			expect(getTrackBackground(getByTestId)).toBe(colors.track.healthy);
		});

		it('uses warning-tinted track for warning state', () => {
			const { getByTestId } = render(<ProgressBar progress={75} planned={100} />);
			expect(getTrackBackground(getByTestId)).toBe(colors.track.warning);
		});

		it('uses overspent-tinted track for overspent state', () => {
			const { getByTestId } = render(<ProgressBar progress={120} planned={100} />);
			expect(getTrackBackground(getByTestId)).toBe(colors.track.overspent);
		});

		it('uses neutral track when planned is 0 with positive progress', () => {
			const { getByTestId } = render(<ProgressBar progress={5} planned={0} />);
			expect(getTrackBackground(getByTestId)).toBe(colors.track.DEFAULT);
		});

		it('uses goal-tinted track for inverse (savings) in-progress', () => {
			const { getByTestId } = render(<ProgressBar progress={40} planned={1000} inverse />);
			expect(getTrackBackground(getByTestId)).toBe(colors.track.goal);
		});

		it('uses healthy-tinted track for inverse (savings) reached', () => {
			const { getByTestId } = render(<ProgressBar progress={100} planned={1000} inverse />);
			expect(getTrackBackground(getByTestId)).toBe(colors.track.healthy);
		});
	});
});
