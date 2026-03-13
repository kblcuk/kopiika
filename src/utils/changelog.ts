// Entire file inlined at build time via babel-plugin-inline-import.
// Only the latest version block is used; if the file grows large (50+ releases),
// consider trimming to last N versions in a prebuild script.
import changelogRaw from '../../CHANGELOG.md';

export interface ChangelogSection {
	type: string;
	items: string[];
}

export interface VersionChangelog {
	version: string;
	date: string;
	sections: ChangelogSection[];
}

/** Parse the latest version block from the inlined CHANGELOG.md */
export function getLatestChangelog(): VersionChangelog | null {
	const versionMatch = changelogRaw.match(/## \[(\d+\.\d+\.\d+)\].*?\((\d{4}-\d{2}-\d{2})\)/);
	if (!versionMatch) return null;

	const version = versionMatch[1];
	const date = versionMatch[2];

	// Grab everything between the first and second version headers
	const blocks = changelogRaw.split(/^## \[/m);
	if (blocks.length < 2) return null;

	const content = blocks[1];
	const sections: ChangelogSection[] = [];

	for (const block of content.split(/^### /m).slice(1)) {
		const lines = block.trim().split('\n');
		const type = lines[0].trim();
		const items = lines
			.slice(1)
			.filter((l) => /^[*-]\s/.test(l))
			.map((l) =>
				l
					.replace(/^[*-]\s+/, '')
					.replace(/\*\*[\w-]+:\*\*\s*/, '') // strip **scope:** prefix
					.replace(/\s*\(\[[\da-f]+\]\([^)]+\)\)$/i, '') // strip ([hash](url))
					.replace(/\s*\([\da-f]+\)$/i, '') // strip (hash)
					.replace(/,\s*closes\s.+$/i, '') // strip closes references
					.trim()
			)
			.filter(Boolean)
			.map((s) => s.charAt(0).toUpperCase() + s.slice(1));

		if (items.length > 0) sections.push({ type, items });
	}

	return { version, date, sections };
}
