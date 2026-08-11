import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PerfProfiler, logProfilerRender } from '../perf-profiler';

describe('PerfProfiler', () => {
	it('renders its children', () => {
		render(
			<PerfProfiler id="test-region">
				<Text testID="child">hello</Text>
			</PerfProfiler>
		);
		expect(screen.getByTestId('child')).toBeTruthy();
	});

	it('logProfilerRender logs the region, phase and duration through markPerf', () => {
		const info = jest.spyOn(console, 'info').mockImplementation(() => {});
		logProfilerRender('summary-header', 'mount', 12.34);
		expect(info).toHaveBeenCalledTimes(1);
		expect(info.mock.calls[0]?.[0]).toMatch(
			/^\[perf\] profile:summary-header:mount \+\d+ms \(Δ\d+ms\) 12\.3ms actual$/
		);
		info.mockRestore();
	});
});
