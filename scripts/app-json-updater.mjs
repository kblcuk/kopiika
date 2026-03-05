// Update app.json to match the version in package.json.

export function readVersion(contents) {
	return JSON.parse(contents).expo.version;
}

export function writeVersion(contents, version) {
	const json = JSON.parse(contents);
	json.expo.version = version;
	return `${JSON.stringify(json, null, '\t')}\n`;
}
