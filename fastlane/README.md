## fastlane documentation

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

### store_screenshots

```sh
[bundle exec] fastlane store_screenshots
```

Capture iOS and Android screenshots from booted simulators/emulators

---

## iOS

### ios setup_signing

```sh
[bundle exec] fastlane ios setup_signing
```

Sync code signing via match

### ios build

```sh
[bundle exec] fastlane ios build
```

Build the app

### ios upload

```sh
[bundle exec] fastlane ios upload
```

Upload latest build to TestFlight (without rebuilding)

### ios promote_external

```sh
[bundle exec] fastlane ios promote_external
```

Promote an uploaded TestFlight build to external tester groups

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Push a new beta build to TestFlight

### ios store_screenshots

```sh
[bundle exec] fastlane ios store_screenshots
```

Capture iOS screenshots from booted simulators (for store assets)

---

## Android

### android build

```sh
[bundle exec] fastlane android build
```

Build Android release bundle (.aab)

### android upload

```sh
[bundle exec] fastlane android upload
```

Upload an Android bundle to Google Play

### android beta

```sh
[bundle exec] fastlane android beta
```

Build and upload a beta build to the internal testing track

### android production

```sh
[bundle exec] fastlane android production
```

Build and upload a production release (defaults to draft for safety)

### android promote

```sh
[bundle exec] fastlane android promote
```

Promote a release from one track to another

### android store_screenshots

```sh
[bundle exec] fastlane android store_screenshots
```

Capture Android screenshots from connected devices/emulators (for store assets)

---

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
