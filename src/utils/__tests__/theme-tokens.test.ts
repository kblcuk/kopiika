// Stop-gap guard for KII-128 (missing `paper-400` shade rendering invisible
// borders). Once we move to Tailwind v4 + NativeWind v5, replace this with
// the `tailwindcss/no-unknown-classes` rule from `oxlint-tailwindcss`, which
// covers the same ground at edit time with autofix + typo suggestions.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { colors } from '../../theme/colors';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['src', 'app', 'components'];
const SCAN_EXTS = new Set(['.ts', '.tsx']);
const IGNORED = new Set(['node_modules', '__tests__', '__snapshots__', '.expo', 'ios', 'android']);

async function collectSourceFiles(dir: string, out: string[] = []): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (IGNORED.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			await collectSourceFiles(full, out);
			continue;
		}
		const dot = entry.name.lastIndexOf('.');
		if (dot === -1) continue;
		if (!SCAN_EXTS.has(entry.name.slice(dot))) continue;
		out.push(full);
	}
	return out;
}

// Matches Tailwind/NativeWind utilities that reference a theme color *shade*,
// e.g. `bg-paper-300`, `text-ink-muted`, `border-accent-light`.
// We only assert on shades that are *numeric* — non-numeric variants would
// require parsing every nested key and produce noisy false positives.
const TOKEN_RE =
	/\b(?:border|bg|text|fill|stroke|ring|shadow|divide|placeholder|caret|accent|outline|decoration)-([a-z]+)-(\d{2,3})\b/g;

describe('theme tokens referenced in className strings', () => {
	test('every numeric color shade used in source resolves to a real palette key', async () => {
		const files: string[] = [];
		for (const sub of SCAN_DIRS) {
			try {
				await collectSourceFiles(join(REPO_ROOT, sub), files);
			} catch {
				// Directory may not exist in some configurations — skip.
			}
		}

		const missing: { file: string; token: string }[] = [];
		const palette = colors as Record<string, Record<string, unknown>>;

		for (const file of files) {
			const text = await readFile(file, 'utf8');
			for (const match of text.matchAll(TOKEN_RE)) {
				const [token, group, shade] = match as unknown as [string, string, string];
				const groupEntry = palette[group];
				if (!groupEntry) continue; // not a known color group (e.g. `text-2xl` filtered by regex anyway)
				if (!(shade in groupEntry)) {
					missing.push({ file: relative(REPO_ROOT, file), token });
				}
			}
		}

		if (missing.length > 0) {
			const summary = missing.map(({ file, token }) => `  ${token} in ${file}`).join('\n');
			throw new Error(
				`Found ${missing.length} className token(s) referencing non-existent theme shades:\n${summary}`
			);
		}
	});
});
