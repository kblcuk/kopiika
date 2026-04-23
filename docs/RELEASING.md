# Releasing

## Command Boundaries

This repo now splits release tooling on purpose:

- Use `mise run ...` for deployment, store uploads, signing, secret-aware preflight checks, and multi-platform orchestration.
- Use `bun run ...` for React Native app work and Bun-native versioning helpers such as `bun run release`.

That keeps the release flow in one place: `mise.toml` is the source of truth for deployment tasks, and Fastlane stays the platform implementation underneath.

The `fnox-env` mise plugin loads encrypted secrets automatically, so release commands do not need a manual `fnox exec -- ...` wrapper.

## Recommended Flow

1. Run release preflight:

```sh
mise run release:doctor
```

This runs:

- `mise run ios:doctor`
- `mise run android:doctor`

2. Bump the app version and sync build numbers:

```sh
bun run release
```

For larger releases:

```sh
bun run release:minor
bun run release:major
```

The version bump flow updates `package.json` and `app.json`, then runs:

- `mise run release:sync-build-numbers`
- `bun run release:check`

3. Ship a platform-specific release or a combined release:

```sh
# iOS TestFlight beta
mise run ios:beta

# Android internal beta
mise run android:beta

# iOS beta + Android beta, then one Telegram notification
mise run release:beta

# iOS beta + Android production draft, then one Telegram notification
mise run release:production
```

If the current marketing version is already on TestFlight or Play, the beta lanes now auto-advance the
store build number (`ios.buildNumber` / `android.versionCode`) in `app.json` before building so you can
ship quick fixes without bumping `expo.version`.

4. Promote existing uploaded builds when needed:

```sh
# iOS external TestFlight groups
TESTFLIGHT_EXTERNAL_GROUPS="External Testers" mise run ios:promote:external

# Android internal -> production
PLAY_FROM_TRACK=internal PLAY_TO_TRACK=production mise run android:promote
```

## iOS TestFlight

The intended iOS flow is:

1. Upload a new build for internal testing.
2. Promote that uploaded build to external tester groups.
3. Later, ship the tested build to production outside this repo's current Fastlane flow.

Useful commands:

```sh
# Validate App Store Connect credentials for the current version
mise run ios:doctor

# Sync development and App Store signing assets
mise run ios:setup

# Build an archive only
mise run ios:build

# Upload the latest archive without rebuilding
mise run ios:upload

# Build + upload a new internal TestFlight build
mise run ios:beta
```

Promoting to external groups:

```sh
TESTFLIGHT_EXTERNAL_GROUPS="External Testers" mise run ios:promote:external
```

Notes:

- `mise run ios:setup` installs both `match development` and `match appstore` assets so local device builds and release builds use the same signing source of truth.
- Promotion uses the uploaded TestFlight build for the current app version by default.
- Set `TESTFLIGHT_APP_VERSION` and/or `TESTFLIGHT_BUILD_NUMBER` if you need to promote a specific build.
- External distribution waits for App Store Connect processing and submits the build for beta review.
- If no external groups are provided, the lane fails fast with a clear error.
- `mise run ios:beta` now bumps `expo.ios.buildNumber` automatically when TestFlight already has the current build for the same app version.

## Android Google Play

One-time setup:

1. Create the app in Play Console (`All apps` -> `Create app`) with package name `com.kblcuk.kopiika`.
2. Complete required app setup/declarations in Play Console so API uploads are allowed.
3. Create a Google Play service account with release permissions appropriate for your target tracks.
4. Invite that service account to the app in Play Console `Users and permissions`.
5. Generate and store the service-account JSON key securely.
6. Configure Android upload signing credentials via environment variables or fnox secrets.

Signing credentials:

```sh
export ANDROID_UPLOAD_STORE_FILE=/absolute/path/to/upload-keystore.jks
export ANDROID_UPLOAD_STORE_PASSWORD=...
export ANDROID_UPLOAD_KEY_ALIAS=...
export ANDROID_UPLOAD_KEY_PASSWORD=...
```

Or provide the keystore as base64 data:

```sh
export ANDROID_UPLOAD_STORE_DATA="$(base64 < /absolute/path/to/upload-keystore.jks)"
export ANDROID_UPLOAD_STORE_PASSWORD=...
export ANDROID_UPLOAD_KEY_ALIAS=...
export ANDROID_UPLOAD_KEY_PASSWORD=...
```

Play API credentials:

```sh
export PLAY_STORE_JSON_KEY_PATH=/absolute/path/to/play-service-account.json
```

or:

```sh
export PLAY_STORE_JSON_KEY_DATA="$(base64 < /absolute/path/to/play-service-account.json)"
```

Useful commands:

```sh
# Validate credentials, package access, and readable tracks
mise run android:doctor

# Build a release .aab only
mise run android:build:release

# Build + upload to internal testing
mise run android:beta

# Build + upload to production as draft by default
mise run android:production

# Upload an existing .aab instead of rebuilding
PLAY_AAB_PATH=/absolute/path/to/app-release.aab mise run android:upload

# Promote an existing release between tracks
PLAY_FROM_TRACK=internal PLAY_TO_TRACK=production mise run android:promote
```

Notes:

- `android:doctor` prints the service-account identity, confirms the target package, and probes readable Play tracks before upload.
- Android build lanes do not run `gradle clean` by default because clean can fail on some React Native/CMake setups. Pass `clean:true` directly to the Fastlane lane if you explicitly need a clean build.
- Android release lanes do not mutate build numbers themselves; they use the values already written to `app.json`.
- `mise run android:beta` is the exception: if Play already has the current `versionCode`, it writes the next available code to `app.json` before building so you can publish another build for the same `expo.version`.

## Build Cleanup

You can clean up old store builds without touching the release flow:

```sh
# Dry-run both stores first
STORE_CLEANUP_DRY_RUN=1 mise run release:cleanup-builds

# Apply cleanup with the default policy
mise run release:cleanup-builds
```

Platform-specific commands:

```sh
# Expire TestFlight builds older than 14 days
mise run ios:cleanup

# Override the iOS retention window
STORE_BUILD_RETENTION_DAYS=21 mise run ios:cleanup

# Prune Play testing tracks down to their newest active release
mise run android:cleanup
```

Cleanup knobs:

- `STORE_CLEANUP_DRY_RUN=1`: preview both iOS and Android cleanup without changing anything.
- `STORE_BUILD_RETENTION_DAYS=14`: TestFlight builds older than this many days are expired.
- `PLAY_CLEANUP_TRACKS=internal,alpha,beta`: comma-separated Play tracks to prune. Defaults to non-production testing tracks only.
- `PLAY_CLEANUP_KEEP_PER_TRACK=1`: number of active Play releases to keep per selected track.

Notes:

- iOS cleanup is truly age-based because App Store Connect exposes each TestFlight build's upload timestamp.
- Google Play track data does not expose build upload age in the API used here, so Android cleanup is release-count-based instead: it keeps the newest active releases on the selected tracks and removes older ones from those tracks.
- Production is excluded from Play cleanup by default for safety. If you really want to prune production too, set `PLAY_CLEANUP_TRACKS=internal,alpha,beta,production` explicitly.

## Build Number Sync

`app.json` is the source of truth for release build numbers:

- `expo.ios.buildNumber`
- `expo.android.versionCode`

If you want to sync build numbers manually for the current version in `app.json`, run:

```sh
mise run release:sync-build-numbers
```

This uses store APIs to write:

- `ios.buildNumber = latest TestFlight build number for the current app version + 1` (or `1` if no build exists yet)
- `android.versionCode = latest Play track versionCode + 1` (or `1` if the package does not exist yet)

`bun run release`, `release:minor`, and `release:major` already run this automatically in their `postbump` hook. That means:

- patch releases scope the iOS build lookup to the newly bumped patch version
- minor and major releases start iOS back at `1` when no TestFlight build exists for that new version yet
- Android still uses the next global `versionCode`, regardless of `versionName`
- `mise run release:beta` and `mise run release:production` also run this sync first so their parallel platform tasks do not race while updating `app.json`

Optional overrides:

- `PLAY_TRACK`: upload target for `android:upload`
- `PLAY_RELEASE_STATUS`: `draft`, `completed`, `inProgress`, or `halted`
- `PLAY_AAB_PATH`: upload an existing `.aab` instead of building one first
- `ANDROID_UPLOAD_STORE_DATA`: base64-encoded upload keystore, used when `ANDROID_UPLOAD_STORE_FILE` is not set
- `KOPIIKA_IOS_BUILD_NUMBER`: force the next iOS build number during sync

iOS also uses the values already written to `app.json`, and the build lane re-syncs native `Info.plist` and Xcode project version fields from `app.json` after Expo prebuild so archive metadata cannot drift.

## fnox Secrets

You can keep both Play JSON and the Android keystore encrypted in `fnox.toml`:

```sh
# Play API JSON -> encrypted as base64
base64 < /absolute/path/to/play-service-account.json | tr -d '\n' | fnox set PLAY_STORE_JSON_KEY_DATA

# Upload keystore -> encrypted as base64
base64 < /absolute/path/to/upload-keystore.jks | tr -d '\n' | fnox set ANDROID_UPLOAD_STORE_DATA

# Remaining signing values
fnox set ANDROID_UPLOAD_STORE_PASSWORD
fnox set ANDROID_UPLOAD_KEY_ALIAS
fnox set ANDROID_UPLOAD_KEY_PASSWORD
```

For iOS / App Store Connect:

```sh
fnox set ASC_KEY_ID
fnox set ASC_ISSUER_ID
fnox set ASC_KEY_CONTENT
fnox set FASTLANE_ITC_TEAM_ID
fnox set MATCH_PASSWORD
```

For Telegram notifications:

```sh
fnox set TELEGRAM_BOT_TOKEN
fnox set TELEGRAM_CHAT_ID
```

After that, plain `mise run ...` commands will load the secrets automatically.

## Release Notes

`CHANGELOG.md` is the single source of truth for release notes. It is generated from conventional commits by `commit-and-tag-version` during `bun run release`.

Release notes flow to three places automatically:

1. In-app "What's New" modal. `CHANGELOG.md` is inlined at build time via `babel-plugin-inline-import`. On first launch after an app update, a modal shows the latest version's changes. Fresh installs skip the modal.
2. Store listings. The iOS `beta` and `promote_external` lanes pass the parsed changelog to TestFlight as "What to Test". The Android `upload` lane writes it to a temporary metadata dir for Play Store release notes.
3. Telegram notifications. The `notify_telegram` lane posts a formatted message to Telegram. It is called by mise umbrella tasks after both platform builds finish.

## Combined Releases with mise

mise can orchestrate both platforms and send one Telegram notification after they finish:

```sh
# Ship both betas in parallel, then notify once
mise run release:beta

# Ship iOS beta + Android production, then notify once
mise run release:production

# Test Telegram notification without building
mise run release:notify
```

These umbrella tasks are the preferred way to run coordinated releases because the release logic stays in one task runner instead of being split across shell wrappers.

## Telegram Notifications

One-time setup:

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram.
2. Add the bot to your release channel or group.
3. Get the chat ID. If using a group, disable group privacy in BotFather first, send a message, then query `https://api.telegram.org/bot<TOKEN>/getUpdates`.
4. Store `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in fnox.

If those env vars are not set, `notify_telegram` skips cleanly.
