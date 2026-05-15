module.exports = function (api) {
	// nativewind's jsxImportSource injects module-level helpers that conflict
	// with jest.mock() hoisting — skip it in the test environment.
	api.cache.using(() => process.env.NODE_ENV);
	const isTest = process.env.NODE_ENV === 'test';
	return {
		presets: [
			['babel-preset-expo', isTest ? {} : { jsxImportSource: 'nativewind' }],
			...(isTest ? [] : ['nativewind/babel']),
		],
		plugins: [['inline-import', { extensions: ['.sql', '.md'] }]],
	};
};
