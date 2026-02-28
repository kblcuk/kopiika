declare module 'nativewind/preset' {
	declare const preset:
		| typeof import('nativewind/dist/tailwind/web')
		| typeof import('nativewind/dist/tailwind/native');

	export = { ...preset, nativewind: true as const };
}
