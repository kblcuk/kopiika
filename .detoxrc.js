/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/kopiika.app',
      build:
        'EXPO_PUBLIC_E2E=true xcodebuild -workspace ios/kopiika.xcworkspace -scheme kopiika -configuration Release -sdk iphonesimulator -derivedDataPath ios/build | xcpretty || true',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build:
        'cd android && EXPO_PUBLIC_E2E=true ./gradlew :app:assembleRelease :app:assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 17 Pro Max' },
    },
    emulator: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_9a' },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
