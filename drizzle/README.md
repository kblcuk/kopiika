# Database Migrations

This directory holds the Drizzle migrations (`NNNN_*.sql`) and their `meta/` snapshots. The schema
itself lives in `src/db/` and the generator is configured by `drizzle.config.ts`.

## Generating a migration

Always generate migrations with drizzle-kit — never hand-write the SQL:

```sh
bunx drizzle-kit generate --name <description>
```

drizzle-kit emits the `.sql` file **and** the matching `meta/<idx>_snapshot.json` it needs to diff
future schema changes against.

A hand-written migration leaves the meta snapshot missing, so the next `drizzle-kit generate` diffs
against a stale baseline and produces a broken migration that re-creates already-existing
tables/columns — this is exactly how the 0014/0015 drift happened.

## Custom SQL

If a migration needs SQL beyond what drizzle-kit emits, generate an empty migration plus snapshot
and fill in the SQL by hand afterwards — do not create the file from scratch:

```sh
bunx drizzle-kit generate --custom --name <description>
```

## Before committing

```sh
bunx drizzle-kit check
```
