import { File, Paths } from 'expo-file-system';

const prefsFile = new File(Paths.document, 'app-prefs.json');

interface AppPrefs {
	lastSeenVersion?: string;
	remindersEnabled?: boolean;
	hasRequestedNotificationPermission?: boolean;
	lastBackgroundNotificationKey?: string | null;
	scheduledReminderKey?: string | null;
	hasCompletedOnboarding?: boolean;
	emptyBoardNudgeDismissed?: boolean;
	defaultCurrency?: string;
}

async function read(): Promise<AppPrefs> {
	try {
		if (!prefsFile.exists) return {};
		return JSON.parse(await prefsFile.text());
	} catch {
		return {};
	}
}

// KII-132: no write serialization — concurrent `set*` callers read-modify-write
// the same file and the last commit wins (silent data loss). Also: only
// `setLastSeenVersion` wraps in try/catch; every other setter is unguarded.
// Fix together: introduce an in-memory source-of-truth + serialized write-through
// (or a single write queue) and wrap every setter consistently.
function write(prefs: AppPrefs): void {
	prefsFile.write(JSON.stringify(prefs));
}

export async function getLastSeenVersion(): Promise<string | null> {
	const prefs = await read();
	return prefs.lastSeenVersion ?? null;
}

export async function setLastSeenVersion(version: string): Promise<void> {
	try {
		const prefs = await read();
		prefs.lastSeenVersion = version;
		write(prefs);
	} catch {
		// non-fatal — modal may re-show on next launch
	}
}

export async function getRemindersEnabled(): Promise<boolean> {
	const prefs = await read();
	return prefs.remindersEnabled ?? false; // opt-in: require explicit user enablement
}

export async function setRemindersEnabled(enabled: boolean): Promise<void> {
	const prefs = await read();
	prefs.remindersEnabled = enabled;
	write(prefs);
}

export async function getHasRequestedPermission(): Promise<boolean> {
	const prefs = await read();
	return prefs.hasRequestedNotificationPermission ?? false;
}

export async function setHasRequestedPermission(value: boolean): Promise<void> {
	const prefs = await read();
	prefs.hasRequestedNotificationPermission = value;
	write(prefs);
}

export async function getLastBackgroundNotificationKey(): Promise<string | null> {
	const prefs = await read();
	return prefs.lastBackgroundNotificationKey ?? null;
}

export async function setLastBackgroundNotificationKey(value: string | null): Promise<void> {
	const prefs = await read();
	prefs.lastBackgroundNotificationKey = value;
	write(prefs);
}

/**
 * Fingerprint of the reminder payloads currently scheduled with the OS
 * (KII-159). Lets the cancel-and-reschedule sweep skip the native work when
 * nothing changed. `null` means "the OS schedule is not known to be complete",
 * which is what the sweep writes before it starts and leaves in place if any
 * entry fails — so the next sweep retries instead of short-circuiting.
 */
export async function getScheduledReminderKey(): Promise<string | null> {
	const prefs = await read();
	return prefs.scheduledReminderKey ?? null;
}

export async function setScheduledReminderKey(value: string | null): Promise<void> {
	const prefs = await read();
	prefs.scheduledReminderKey = value;
	write(prefs);
}

export async function getHasCompletedOnboarding(): Promise<boolean> {
	const prefs = await read();
	return prefs.hasCompletedOnboarding ?? false;
}

export async function setHasCompletedOnboarding(value: boolean): Promise<void> {
	const prefs = await read();
	prefs.hasCompletedOnboarding = value;
	write(prefs);
}

export async function getEmptyBoardNudgeDismissed(): Promise<boolean> {
	const prefs = await read();
	return prefs.emptyBoardNudgeDismissed ?? false;
}

export async function setEmptyBoardNudgeDismissed(value: boolean): Promise<void> {
	const prefs = await read();
	prefs.emptyBoardNudgeDismissed = value;
	write(prefs);
}

/**
 * The currency chosen at onboarding (KII-155). Only a seed: once a user entity
 * exists, `resolveAppCurrency` reads the currency off the row data instead.
 * `null` means "never chosen".
 */
export async function getDefaultCurrency(): Promise<string | null> {
	const prefs = await read();
	return prefs.defaultCurrency ?? null;
}

export async function setDefaultCurrency(code: string): Promise<void> {
	const prefs = await read();
	prefs.defaultCurrency = code;
	write(prefs);
}
