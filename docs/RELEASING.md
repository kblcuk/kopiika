# Releasing

## iOS TestFlight

The intended iOS release flow is:

1. Upload a new build for internal testing.
2. Promote that existing uploaded build to external tester groups.
3. Later, ship the tested build to production.

Upload the internal TestFlight build with:

```sh
bun run ios:beta
```

That lane uploads the build to TestFlight and skips the wait for full App Store Connect processing.

To promote the uploaded build to external tester groups, set `TESTFLIGHT_EXTERNAL_GROUPS`
to a comma-separated list of App Store Connect external group names or IDs, then run:

```sh
TESTFLIGHT_EXTERNAL_GROUPS="External Testers" bun run ios:promote:external
```

Notes:

- Promotion uses the uploaded TestFlight build for the current app version by default.
- Set `TESTFLIGHT_APP_VERSION` and/or `TESTFLIGHT_BUILD_NUMBER` if you need to promote a specific build explicitly.
- External distribution waits for build processing and submits the build for beta review.
- If no external groups are provided, the promotion lane fails fast with a clear error.

## Android Google Play

Fastlane now supports Android release bundle builds and Play track uploads.

One-time setup:

1. Create the app in Play Console (`All apps` -> `Create app`) with package name `com.kblcuk.kopiika`.
2. Complete required app setup/declarations in Play Console so API uploads are allowed.
3. Create a Google Play service account with `Release to production, exclude devices, and use Play App Signing` permissions (or stricter as needed).
4. In Play Console, invite that service account user to your app via `Users and permissions`.
5. Generate and store the service-account JSON key securely.
6. Configure Android upload signing credentials via environment variables:

```sh
export ANDROID_UPLOAD_STORE_FILE=/absolute/path/to/upload-keystore.jks
export ANDROID_UPLOAD_STORE_PASSWORD=...
export ANDROID_UPLOAD_KEY_ALIAS=...
export ANDROID_UPLOAD_KEY_PASSWORD=...
```

Or provide the keystore as base64 data instead of a local file path:

```sh
export ANDROID_UPLOAD_STORE_DATA="$(base64 < /absolute/path/to/upload-keystore.jks)"
export ANDROID_UPLOAD_STORE_PASSWORD=...
export ANDROID_UPLOAD_KEY_ALIAS=...
export ANDROID_UPLOAD_KEY_PASSWORD=...
```

1. Configure Play API credentials using one of:

```sh
export PLAY_STORE_JSON_KEY_PATH=/absolute/path/to/play-service-account.json
```

or

```sh
export PLAY_STORE_JSON_KEY_DATA="$(base64 < /absolute/path/to/play-service-account.json)"
```

Common release commands:

```sh
# Validate Play API credentials and app access
bun run android:doctor

# Build a release .aab
bun run android:build:release

# Build + upload to internal testing track
bun run android:beta

# Build + upload to production track as draft (default safety behavior)
bun run android:production

# Promote existing release between tracks
PLAY_FROM_TRACK=internal PLAY_TO_TRACK=production bun run android:promote
```

`android:doctor` is a preflight check that prints the service-account identity from your key, confirms the target package, and probes Play track access before upload.

By default, Android release lanes do not run `gradle clean` because clean can fail on some React Native/CMake setups. If you explicitly want a clean build, pass `clean:true` to the fastlane lane.

## Build Number Sync

`app.json` is the source of truth for release build numbers:

- `expo.ios.buildNumber`
- `expo.android.versionCode`

Before creating a release tag, run:

```sh
bun run release:sync-build-numbers
```

This uses Fastlane store APIs to fetch latest distributed build numbers and writes:

- `ios.buildNumber = latest TestFlight build number + 1` (or `1` if unavailable)
- `android.versionCode = latest Play track versionCode + 1` (or `1` if app/package is not found)

`bun run release`, `release:minor`, and `release:major` now run this sync step automatically.

Optional overrides:

- `PLAY_TRACK`: upload target (`internal`, `beta`, `production`, etc.) when using `android:upload`.
- `PLAY_RELEASE_STATUS`: release status (`draft`, `completed`, `inProgress`, `halted`).
- `PLAY_AAB_PATH`: upload an existing `.aab` instead of building one first.
- `ANDROID_UPLOAD_STORE_DATA`: base64 encoded upload keystore (`.jks`), used when `ANDROID_UPLOAD_STORE_FILE` is not set.

Android and iOS build lanes do not mutate build numbers themselves. They use the values already written to `app.json` and run Expo prebuild before the native build so generated files pick up the current config.

### Fnox-only secrets flow (no key files in repo)

You can keep both Play JSON and Android keystore encrypted in `fnox.toml`:

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

Then release with secrets loaded:

```sh
fnox exec -- bun run android:beta
```

## Release Notes

`CHANGELOG.md` is the single source of truth for all release notes. It is auto-generated from conventional commits by `commit-and-tag-version` during `bun run release`.

Release notes flow to three places automatically:

1. **In-app "What's New" modal** — `CHANGELOG.md` is inlined at build time via `babel-plugin-inline-import`. On first launch after an app update, a modal shows the latest version's changes. Fresh installs skip the modal.

2. **Store listings** — The iOS `beta` and `promote_external` lanes pass the parsed changelog to TestFlight as "What to Test". The Android `upload` lane writes it to a temp metadata dir for Play Store release notes.

3. **Telegram notifications** — The `notify_telegram` Fastlane lane posts a formatted message to a Telegram group. Called by mise umbrella tasks after builds complete.

## Parallel Releases with mise

mise orchestrates iOS + Android builds in parallel and sends a single Telegram notification when both finish:

```sh
# Ship both betas in parallel, then notify once
mise run release:beta

# Ship iOS beta + Android production in parallel, then notify
mise run release:production

# Test Telegram notification without building
mise run release:notify
```

Individual platform releases still work standalone via `bun run`:

```sh
bun run ios:beta
bun run android:beta
```

These do not send Telegram notifications — only the mise umbrella tasks do.

## Telegram Notifications

One-time setup:

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram.
2. Add the bot to your release channel/group.
3. Get the chat ID (disable group privacy in BotFather first, then send a message and query `https://api.telegram.org/bot<TOKEN>/getUpdates`).
4. Store the secrets in fnox:

```sh
fnox set TELEGRAM_BOT_TOKEN
fnox set TELEGRAM_CHAT_ID
```

If the env vars are not set, `notify_telegram` silently skips.
