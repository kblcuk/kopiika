const fs = require('node:fs');
const path = require('node:path');

function readJson(relativePath) {
	const filePath = path.join(__dirname, '..', relativePath);
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const packageJson = readJson('package.json');
const appJson = readJson('app.json');

if (packageJson.version !== appJson.expo.version) {
	console.error(
		`Version mismatch: package.json=${packageJson.version}, app.json=${appJson.expo.version}`,
	);
	process.exit(1);
}

console.log(`Versions in sync: ${packageJson.version}`);
