/**
 * Generate splash screen PNGs from SVG sources (light + dark).
 *
 * Usage:  bun run scripts/generate-splash.ts
 *
 * Requires: @resvg/resvg-js (devDependency)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(import.meta.dirname, '..');
const FONT_PATH = join(
	ROOT,
	'node_modules/@expo-google-fonts/lexend/500Medium/Lexend_500Medium.ttf'
);

const variants = [
	{
		svg: join(ROOT, 'assets/images/splash-icon.svg'),
		out: join(ROOT, 'assets/images/splash-icon.png'),
		label: 'light',
	},
	{
		svg: join(ROOT, 'assets/images/splash-icon-dark.svg'),
		out: join(ROOT, 'assets/images/splash-icon-dark.png'),
		label: 'dark',
	},
];

for (const { svg: svgPath, out, label } of variants) {
	const svg = readFileSync(svgPath, 'utf-8');
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: 1024 },
		font: {
			fontFiles: [FONT_PATH],
			loadSystemFonts: false,
			defaultFontFamily: 'Lexend',
		},
	});

	const pngBuffer = resvg.render().asPng();
	writeFileSync(out, pngBuffer);
	console.log(`[${label}] ${out} (${pngBuffer.byteLength} bytes)`);
}
