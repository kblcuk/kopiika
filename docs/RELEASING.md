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
