import { File, Paths } from 'expo-file-system';

const prefsFile = new File(Paths.document, 'app-prefs.json');

interface AppPrefs {
	lastSeenVersion?: string;
	remindersEnabled?: boolean;
	hasRequestedNotificationPermission?: boolean;
	lastBackgroundNotificationKey?: string | null;
}

async function read(): Promise<AppPrefs> {
	try {
		if (!prefsFile.exists) return {};
		return JSON.parse(await prefsFile.text());
	} catch {
		return {};
	}
}

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
