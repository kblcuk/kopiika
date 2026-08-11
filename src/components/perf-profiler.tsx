import { Profiler, type ReactNode } from 'react';
import { isPerfEnabled, markPerf } from '@/src/utils/perf-marks';

/**
 * Dev-only render-cost probe (KII-144). Wraps children in a React <Profiler>
 * that reports each commit's actualDuration through markPerf; in release
 * builds it renders children directly with zero overhead.
 */
export function logProfilerRender(
	id: string,
	phase: 'mount' | 'update' | 'nested-update',
	actualDuration: number
): void {
	markPerf(`profile:${id}:${phase}`, `${actualDuration.toFixed(1)}ms actual`);
}

export function PerfProfiler({ id, children }: { id: string; children: ReactNode }) {
	if (!isPerfEnabled()) return <>{children}</>;
	return (
		<Profiler id={id} onRender={logProfilerRender}>
			{children}
		</Profiler>
	);
}
