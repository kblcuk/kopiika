/**
 * Permanent, dev-only cold-start instrumentation (KII-144). Marks log
 * `[perf] <label> +<ms since JS start> (Δ<ms since previous mark>)` so any
 * future perf round can re-measure without re-instrumenting. Calls become
 * runtime no-ops in release builds via the __DEV__ check below (the call
 * site's argument construction still happens — nothing is stripped at
 * compile time); enabled under test runners via NODE_ENV.
 */
declare const __DEV__: boolean | undefined;

const origin = Date.now();
let last = origin;

export function isPerfEnabled(): boolean {
	if (typeof __DEV__ !== 'undefined') return __DEV__;
	return process.env.NODE_ENV !== 'production';
}

export function markPerf(label: string, extra?: string): void {
	if (!isPerfEnabled()) return;
	const now = Date.now();
	const suffix = extra ? ` ${extra}` : '';
	console.info(`[perf] ${label} +${now - origin}ms (Δ${now - last}ms)${suffix}`);
	last = now;
}
