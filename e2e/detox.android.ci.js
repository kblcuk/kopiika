const config = require('../.detoxrc');

module.exports = {
	...config,
	apps: {
		...config.apps,
		'android.debug': {
			...config.apps['android.debug'],
			binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
			build: 'cd android && NODE_ENV=test EXPO_PUBLIC_E2E=true ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug --stacktrace',
		},
	},
	devices: {
		...config.devices,
		emulator: {
			...config.devices.emulator,
			device: {
				avdName: process.env.DETOX_ANDROID_AVD ?? config.devices.emulator.device.avdName,
			},
		},
	},
};
