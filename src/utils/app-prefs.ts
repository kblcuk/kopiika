import { File, Paths } from 'expo-file-system';

const prefsFile = new File(Paths.document, 'app-prefs.json');

interface AppPrefs {
	lastSeenVersion?: string;
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
