/**
 * Civil-date arithmetic. Results are built from LOCAL components
 * (`new Date(y, m, d, h, …)`) rather than by adding milliseconds, so a shift
 * across a DST boundary lands on the intended calendar day at the same
 * wall-clock time instead of drifting an hour.
 *
 * Month and year shifts clamp the day to the target month's last day
 * (Jan 31 + 1 month → Feb 28). The clamp is always derived from the BASE day,
 * so repeated shifts cannot accumulate drift.
 */
export function shiftCivilDate(
	base: Date,
	delta: { days?: number; months?: number; years?: number }
): Date {
	const day = base.getDate();
	const h = base.getHours();
	const min = base.getMinutes();
	const s = base.getSeconds();
	const ms = base.getMilliseconds();

	// Land on the target month with day = 1 first. Carrying the base day through
	// this step would overflow instead of clamping: Jan 31 + 1 month would roll
	// into March rather than settling on Feb 28.
	const target = new Date(
		base.getFullYear() + (delta.years ?? 0),
		base.getMonth() + (delta.months ?? 0),
		1,
		h,
		min,
		s,
		ms
	);
	// Day 0 of the following month is the last day of the target month.
	const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();

	return new Date(
		target.getFullYear(),
		target.getMonth(),
		Math.min(day, maxDay) + (delta.days ?? 0),
		h,
		min,
		s,
		ms
	);
}

/** Whether two dates fall on the same LOCAL calendar day. */
export function isSameCivilDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}
