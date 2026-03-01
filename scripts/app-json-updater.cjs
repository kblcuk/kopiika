// Update app.json to match the version in package.json.

module.exports.readVersion = function (contents) {
	return JSON.parse(contents).expo.version;
};

module.exports.writeVersion = function (contents, version) {
	const json = JSON.parse(contents);
	json.expo.version = version;
	return `${JSON.stringify(json, null, '\t')}\n`;
};
