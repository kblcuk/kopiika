import { File, Paths } from 'expo-file-system';

import type { EntityType } from '@/src/types';

const prefsFile = new File(Paths.document, 'app-prefs.json');

interface AppPrefs {
	lastSeenVersion?: string;
	remindersEnabled?: boolean;
	hasRequestedNotificationPermission?: boolean;
	lastBackgroundNotificationKey?: string | null;
	hasCompletedOnboarding?: boolean;
	emptyBoardNudgeDismissed?: boolean;
	// Home-board section collapse flags; a missing section reads as expanded.
	collapsedSections?: Partial<Record<EntityType, boolean>>;
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

export async function getCollapsedSections(): Promise<Record<EntityType, boolean>> {
	const prefs = await read();
	const stored = prefs.collapsedSections ?? {};
	return {
		income: stored.income ?? false,
		account: stored.account ?? false,
		category: stored.category ?? false,
		saving: stored.saving ?? false,
	};
}

export async function setCollapsedSections(value: Record<EntityType, boolean>): Promise<void> {
	const prefs = await read();
	prefs.collapsedSections = value;
	write(prefs);
}
