import packageJson from '../package.json' with { type: 'json' };
import appJson from '../app.json' with { type: 'json' };

if (packageJson.version !== appJson.expo.version) {
	console.error(
		`Version mismatch: package.json=${packageJson.version}, app.json=${appJson.expo.version}`
	);
	process.exit(1);
}

console.log(`Versions in sync: ${packageJson.version}`);
