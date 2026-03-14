fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

### sync_build_numbers

```sh
[bundle exec] fastlane sync_build_numbers
```

Sync app.json build numbers from App Store Connect and Google Play

### notify_telegram

```sh
[bundle exec] fastlane notify_telegram
```

Send release notification to Telegram group

----


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

----


## Android

### android doctor

```sh
[bundle exec] fastlane android doctor
```

Validate Google Play API credentials and app access before upload

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

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
