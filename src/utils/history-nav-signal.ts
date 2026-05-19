// One-shot navigation signal from Dashboard/Summary → History.
//
// Why a module-level signal instead of URL query params: Expo Router
// preserves the route params for a tab screen across tab-bar focuses, so
// `?entityId=X` from a previous push looks identical to a fresh push on a
// later tab visit. Past attempts at distinguishing the two via refs
// produced an alternating bug (KII-111). A one-shot signal is unambiguous:
// the producer sets it right before `router.push('/history')`, the
// consumer reads-and-clears it on focus. Tab-bar visits see no pending
// signal and reset to defaults.

export interface PendingHistoryFilter {
	entityId?: string;
	period?: string;
}

let pending: PendingHistoryFilter | null = null;

export function setPendingHistoryFilter(filter: PendingHistoryFilter): void {
	pending = filter;
}

export function consumePendingHistoryFilter(): PendingHistoryFilter | null {
	const value = pending;
	pending = null;
	return value;
}
