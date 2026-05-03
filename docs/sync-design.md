# Household Sync Design

## Status

Draft, 2026-05-03. Supersedes the architecture refactor scope in
[architecture-layering-proposal.md](architecture-layering-proposal.md). The original proposal
remains as historical context; this doc is the actionable plan for the work tracked under
[KII-96](https://linear.app/kopiika/issue/KII-96).

## Goals

- Two trusted household members can share selected entities and transactions across Android and iOS.
- Local-first preserved: SQLite is canonical on each device. The relay never sees readable finance
  data.
- No user accounts. Pairing happens in person via QR / short code.
- Each device keeps personal view preferences (sort order, totals inclusion, default account)
  independent of household state.
- One canonical mutation chokepoint (`applyOperation`) serves both local UI actions and inbound
  sync packets.

## Non-Goals

- No realtime presence, cursors, or chat.
- No multi-household per device in v1 (one household membership max).
- No recovery model if all paired devices are lost (clearly surfaced in UX copy).
- No backend storage of any readable domain data.
- No swap of SQLite or Drizzle. The remote is an opaque encrypted mailbox, not a relational store.

## Architecture Overview

```
┌──────────────┐   encrypted op packets    ┌────────────────────┐
│  Device A    │ ─────────────────────────▶│ Cloudflare Worker  │
│ (SQLite +    │                           │  + Durable Object  │
│  op journal) │ ◀─────────────────────────│ (opaque mailbox)   │
└──────────────┘                           └────────────────────┘
       ▲                                              │
       │                                              ▼
       │             encrypted op packets    ┌──────────────┐
       └────────────────────────────────────▶│  Device B    │
                                             └──────────────┘
```

- **Sync model:** operation log, not row replication. Every mutation is an `Op`. Devices push their
  outbound ops to a per-household mailbox, pull others' ops, and apply them locally.
- **Crypto:** each device generates a local keypair. Ops are signed by sender, encrypted for each
  recipient device. Server sees opaque blobs.
- **Transport:** chosen — Cloudflare Workers + Durable Objects. Rejected: Turso (encrypted blobs
  defeat its relational/CDC value; introduces account/token surface contradicting the no-account
  goal).
- **Pairing:** in-person QR exchange of public keys + short numeric confirmation.
- **No push:** devices poll on app open / via background fetch with OS-allowed cadence. Push-free
  sync is not instant; UX should set this expectation.

## Data Model

### Field locality on entities

Every entity field is one of three kinds:

| Field                                             | Kind                       | Notes                                            |
| ------------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `id`, `name`, `type`, `currency`, `is_investment` | Shared                     | Identity / facts                                 |
| `is_deleted`                                      | Shared                     | Tombstone. Final                                 |
| `visibility` (new: `private` \| `household`)      | Shared                     | Per-entity visibility decision                   |
| `position` / sort order                           | Per-device                 | View preference                                  |
| `include_in_total`                                | Per-device                 | "What counts as my net worth" is personal        |
| `is_default` (preferred quick-add account)        | Per-device                 | Workflow preference                              |
| `color`                                           | Shared with local override | Shared baseline; per-device override wins if set |
| `icon`                                            | Shared with local override | Same pattern as color                            |

Plans on shared entities are themselves shared (household budget agreement). Plans on private
entities are private to the owner.

Transactions: all fields shared (it's an event). `is_confirmed` shared too — confirmation is
"we acknowledged this happened", not a per-device flag.

Reservations (account ↔ saving): shared. They affect derived balances both partners see.

Notifications, reminders, badge counts, app theme: per-device, as today.

### New tables

```
households (
  id text primary key,
  created_at integer
)

household_members (
  household_id text references households(id),
  device_id text,
  device_name text,
  public_key blob,
  joined_at integer,
  primary key (household_id, device_id)
)

local_device (              -- single-row table
  device_id text primary key,
  private_key blob,
  public_key blob,
  household_id text nullable
)

entity_visibility (
  entity_id text primary key references entities(id),
  visibility text check (visibility in ('private', 'household')) not null default 'private'
)

device_entity_preferences (
  device_id text,
  entity_id text references entities(id),
  position integer nullable,
  include_in_total integer nullable,        -- 0/1, null = use shared default
  is_default integer nullable,
  color_override text nullable,              -- null = use shared color
  icon_override text nullable,               -- null = use shared icon
  primary key (device_id, entity_id)
)

op_journal (                -- ops awaiting outbound sync, plus applied-op log
  op_id text primary key,
  hlc text not null,                         -- hybrid logical clock
  device_id text not null,                   -- origin
  kind text not null,
  payload text not null,                     -- json-encoded op body
  state text not null check (state in ('pending', 'sent', 'acked', 'inbound')),
  applied_at integer not null
)

device_cursors (             -- per-peer pull progress
  device_id text primary key,
  last_pulled_hlc text
)

tombstones (                 -- for transactions; entities already soft-delete
  row_table text not null,
  row_id text not null,
  deleted_at_hlc text not null,
  primary key (row_table, row_id)
)
```

Schema migration steps:

1. Add `entity_visibility` (default `private` for all existing rows — backward compatible).
2. Move `position`, `include_in_total`, `is_default` from `entities` to
   `device_entity_preferences`. Backfill the local device's row from current entity values.
3. Add tombstone table; existing entity soft-delete stays in `entities.is_deleted` for now and is
   mirrored to tombstones for sync packet generation.
4. New tables (`households`, `household_members`, `local_device`, `op_journal`, `device_cursors`)
   are additive.

### Render-time merge

Per-entity rendering uses:

```ts
const effective = {
	...entity,
	position: prefs?.position ?? defaultPosition,
	include_in_total: prefs?.include_in_total ?? entity.include_in_total ?? true,
	is_default: prefs?.is_default ?? false,
	color: prefs?.color_override ?? entity.color,
	icon: prefs?.icon_override ?? entity.icon,
};
```

Editing UX:

- Color/icon edits default to "for me only" (write override). A secondary "Apply to household"
  action propagates the change to the shared field.
- A "Reset to household color" gesture clears the override.
- Position, include-in-total, is_default edits are always local; no sync.

## Operation Model

### The Op union

```ts
type Op =
  | { kind: 'entity.create',  fields: EntitySharedFields, ... }
  | { kind: 'entity.update',  id: string, patch: Partial<EntitySharedFields>, ... }
  | { kind: 'entity.delete',  id: string, ... }
  | { kind: 'entity.set_visibility', id: string, visibility: 'private' | 'household', ... }
  | { kind: 'plan.set',       entity_id: string, amount: number, ... }
  | { kind: 'plan.delete',    entity_id: string, ... }
  | { kind: 'transaction.create', fields: TransactionFields, ... }
  | { kind: 'transaction.update', id: string, patch: Partial<TransactionFields>, ... }
  | { kind: 'transaction.delete', id: string, ... }
  | { kind: 'transaction.confirm', id: string, ... }
  | { kind: 'transaction.batch_create', fields: TransactionFields[], batch_id: string, ... }   // splits
  | { kind: 'reservation.set', account_id: string, saving_id: string, total_amount: number, ... }
  | { kind: 'recurrence.create', template: RecurrenceTemplate, ... }
  | { kind: 'recurrence.update', id: string, patch: Partial<RecurrenceTemplate>, ... }
  | { kind: 'recurrence.delete_future', id: string, from_date: number, ... }
  | { kind: 'market_value.snapshot', entity_id: string, amount: number, date: number, ... }

interface OpEnvelope {
  op_id: string;       // ULID-ish, generated at op creation, never reused
  hlc: string;         // hybrid logical clock at creation
  device_id: string;   // origin device
  signature: string;   // ed25519 over canonical-encoded payload
}
```

Op IDs are distinct from row IDs. A `transaction.create` op has its own `op_id` and produces a
transaction row whose `id` is whatever the op specifies. Two devices that re-receive the same op
recognize it by `op_id` and skip.

### Hybrid Logical Clock

Single string field: `<wall_ms>:<counter>:<device_id>`. Why HLC and not vector clocks: at 2–3
devices per household, vector clocks are overkill; HLC is sortable, almost-monotonic with wall
time (good UX for LWW intuition: "later edit wins matches user expectation"), and tolerant of
modest clock skew.

### `applyOperation` contract

```ts
async function applyOperation(op: OpEnvelope, source: 'local' | 'inbound'): Promise<void>;
```

Behavior:

1. Idempotency: if `op_id` already in `op_journal`, return immediately.
2. Verify signature if `source === 'inbound'`.
3. Validate against domain rules (`utils/transaction-validation.ts` extended for visibility
   consistency — see Mixed-entity Policy below).
4. Apply to SQLite within a transaction:
    - Conflict resolution per the policy table below
    - Update affected rows
5. Insert into `op_journal` with state `pending` (if local) or `inbound` (if remote).
6. Bump local HLC on inbound to `max(local, remote) + 1`.
7. Trigger Zustand store reconciliation.

Outbound sync runs separately: collect `state='pending'` rows, encrypt for each peer, push, mark
`sent`, await ack, mark `acked`.

## Conflict Policy

| Scenario                                                                  | Policy                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two devices edit different fields on same row                             | Per-field LWW (rename + recolor both win)                                                                                                                                                   |
| Two devices edit same field on same row                                   | LWW by HLC                                                                                                                                                                                  |
| Delete vs concurrent edit (same row)                                      | **Delete wins.** Edit becomes no-op. Surface a one-time "your edit didn't apply, item was deleted on another device" toast on the editing device when the delete arrives                    |
| Two creates with different IDs (e.g., both add a "Groceries" transaction) | Both apply. They are independent events, not duplicates. Users decide if one was a mistake                                                                                                  |
| `reservation.set` from two devices                                        | LWW on `total_amount` (intent semantics, not additive)                                                                                                                                      |
| Recurrence: delete-future from D vs edit instance ≥ D                     | Delete-future wins for affected instances                                                                                                                                                   |
| Recurrence: edit instance < D unaffected                                  | Apply normally                                                                                                                                                                              |
| Reorder (sort position)                                                   | Never syncs (per-device)                                                                                                                                                                    |
| Visibility flip (private ↔ household)                                     | LWW on visibility field. Edge case: entity goes private after transactions referencing it have synced — historical transactions remain visible to household via the partial-sync rule below |

The unifying rule: **same row ID → LWW per field; tombstone trumps edit; creates are independent.**

## Mixed-Entity Transaction Policy (v1: disallow with prompt)

If a transaction references one shared entity and one private entity:

- **Disallow at creation.** UI shows a modal:

    > "Joint Account is shared with your household, but Hobbies is private. Make Hobbies shared
    > with your household too?"
    >
    > [Make Hobbies Shared & Save] [Cancel]

    "Make Shared" updates `entity_visibility` for the private entity (an op) and proceeds with the
    transaction (another op) atomically.

- Validator rule (extends `utils/transaction-validation.ts`): if `from.visibility != to.visibility`
  and one is `household`, reject with a typed error code that the UI catches to show the prompt.

- Inbound sync: the validator runs on inbound ops too. A peer's transaction op referencing an
  entity not visible to us means that entity must already exist on our side (the `entity.create`
  op preceded the transaction op). If not (out-of-order), buffer until prerequisites arrive.

This v1 design is intentionally restrictive. Easier to relax to "partial sync, obscure private
side" (KII-96 Option B) later than to retract a permissive default.

## Mutation Chokepoint Refactor

This is the absorbing refactor. It replaces what the layering proposal called Steps 2, 3, and 4.

### Stage 1 — Operations infrastructure (no UI changes)

- Add `op_journal`, `device_cursors`, `tombstones`, `local_device` tables.
- Add `Op` union, `OpEnvelope`, HLC implementation in `src/sync/`.
- Add `applyOperation(op, source)` with idempotency, validation, and persistence — no transport,
  no crypto.
- Validation: extend `utils/transaction-validation.ts` to enforce all rules at the mutation
  boundary (was: layering Step 2). Same module, more callers.

**Status (2026-05-03, [KII-98](https://linear.app/kopiika/issue/KII-98)):** the no-regret subset
landed. Validation centralization and row-construction extraction are done; op infrastructure is
not yet started.

- Done — `src/utils/transaction-validation.ts` exports `validateTransaction`, `validateUpdate`,
  `ensureValid`, and a typed `TransactionValidationError`. Bidirectional balance-adjustment
  carve-out (account ↔ BAL) lives here; the deleted-entity edit carve-out is preserved in
  `validateUpdate`.
- Done — `src/utils/transaction-builder.ts` holds `buildTransaction`, `buildSplitRows`,
  `buildSavingsReleases`, `buildRecurringTemplate`, plus `normalizeCreateTimestamp` and
  `defaultIsConfirmed`. Builders trust their inputs; validation is run separately by callers.
- Wired through — `addTransaction`, `updateTransaction`, `updateTransactionWithScope` (single +
  future), `addRecurringTransaction`, `reserveToSaving`, `replaceAllData` (CSV import, skip-on-
  invalid), and `backfillRecurrences` (skip templates whose entities became invalid). UI surfaces
  catch `TransactionValidationError` and `Alert.alert`: `transaction-modal.tsx`,
  `entity-detail-modal.tsx`, `reservation-modal.tsx`.
- Caveat — validation runs at the **store boundary**, not yet inside `applyOperation`. The
  validator/builder signatures are deliberately shaped so Stage 1 completion only needs to call
  them from the new `applyOperation` path; no API churn expected.
- Not yet started — `op_journal`/`device_cursors`/`tombstones`/`local_device` tables, the `Op`
  union and `OpEnvelope`, HLC, `applyOperation` itself.

### Stage 2 — Migrate mutations through `applyOperation`

Touch each store action one at a time. UI keeps calling `store.addTransaction()`, but the store
action becomes:

```ts
addTransaction: async (input) => {
	const op = buildOp({ kind: 'transaction.create', fields: input });
	await applyOperation(op, 'local');
	// store reconciles from SQLite
};
```

`buildOp` lives in `src/sync/build-op.ts` and handles ID generation, HLC stamping, signing.

Order to migrate:

1. `addTransaction`, `updateTransaction`, `deleteTransaction`, `confirmTransaction` (highest
   value — TransactionModal shrinks once row construction moves into `buildOp`).
2. Recurring transaction creation/edit/delete (with `recurrence.*` ops; the future-instance
   regeneration happens after applying the template op).
3. Reservation flow (`reserveToSaving` becomes a `reservation.set` op; the additive vs
   intent-target semantics get fixed here).
4. Entity create/update/delete, plan set/delete.
5. Import: produces a batch of ops, applies each via `applyOperation`. Atomicity via outer
   transaction.

After this stage:

- `TransactionModal` constructs an _intent_ (form state) and submits via store. Row construction
  lives in `buildOp`. Modal expected to shrink from 1344 LOC to <600.
- Store actions are thin wrappers, ~3 lines each. Store size drops from 1109 LOC.

### Stage 3 — Two-replica local spike

Two in-process app instances sharing nothing but op packets via an in-memory bus. Verify
convergence under:

- Concurrent edits
- Concurrent deletes
- Out-of-order delivery
- Replay (idempotency)
- Conflict policy table cases

This is exactly KII-96 implementation step 3 ("Build pure local sync engine first"). No crypto, no
transport. Pure correctness.

### Stage 4 — Crypto layer

- ed25519 keypair per device, stored in `local_device`.
- Each outbound op encrypted per-recipient (libsodium sealed boxes or X25519 + chacha20-poly1305).
- Signature verification on inbound.

### Stage 5 — Cloudflare Worker + Durable Object transport

Worker routes:

- `POST /household` — create household (returns household_id); creator becomes first member.
- `POST /household/:id/join` — join request: device_id + public_key + signed challenge. Pending
  until existing member confirms in-app.
- `POST /household/:id/confirm` — existing member acks new device.
- `POST /household/:id/packets` — push encrypted packets.
- `GET /household/:id/packets?cursor=X` — pull packets after cursor.
- `POST /household/:id/ack` — ack packets.

Durable Object per household holds ordered packet log, member list, and pending-join state. No
domain knowledge.

Authorization: every request signed by device key; DO verifies against household member list.

### Stage 6 — Household UX

- Settings → "Household Sync" entry.
- Create household / join household flows with QR + 6-digit confirm code.
- Per-entity visibility toggle on entity detail screen.
- Sync status indicator (last sync, pending count, errors).
- Mixed-entity transaction prompt (see policy above).
- Override UX for color/icon ("for me" vs "for household" + reset).

### Stage 7 — Productionize

- Background fetch / app-open sync cadence.
- Abuse controls (rate limits per household).
- Free-tier monitoring; clear UX for free-tier limits if hit.
- Recovery limitations documented in Settings.

## Mapping Back to the Layering Proposal

| Layering proposal step                    | Status under sync design                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Move balance derivation to domain      | Dropped. Irrelevant to sync; balances are pure functions over current SQLite                                 |
| 2. Validate at mutation boundary          | **Partial (KII-98).** Enforced at store boundary today; moves into `applyOperation` when Stage 1 lands       |
| 3. Extract transaction creation use cases | **Partial (KII-98).** Row construction lives in `transaction-builder.ts`; use-case → op migration is Stage 2 |
| 4. Extract reservation use cases          | **Absorbed.** `reservation.set` op. Stage 2                                                                  |
| 5. Split store into slices                | Deferred. Will need a sync-state slice eventually; bolt on when needed                                       |
| 6. App-owned types + DB mappers           | Dropped. No remote relational schema to decouple from                                                        |
| 7. Reminder orchestration as service      | Orthogonal. Still useful, separate work item                                                                 |
| 8. Remove direct DB calls from UI         | Opportunistic. Fix when a touched component needs cleanup                                                    |

## Open Questions

- **Recurrence-generated occurrences and sync.** Currently the local device generates future
  occurrences from a template. With sync, two devices may generate overlapping occurrences. Either
  (a) only the device that owns the template generates, and others receive `transaction.create`
  ops, or (b) generation is deterministic from the template + a date range, so devices converge
  without explicit sync. Option (b) is simpler if we can guarantee determinism. Decide before
  Stage 2 step 2.
- **Out-of-order arrival.** A `transaction.create` referencing an entity whose `entity.create`
  hasn't arrived yet. Buffer pending ops until prerequisites arrive, or apply optimistically and
  reconcile? Buffering is safer.
- **Key rotation / device removal.** Removing a member from the household should rotate keys so
  they can no longer decrypt new packets. Out of scope for v1 spike but flag in UX.
- **Backup / recovery.** All-devices-lost = data loss. Acceptable for v1 with explicit copy.
  Future: optional encrypted local backup to user's iCloud/Google Drive.
- **Free-tier abuse.** Public DO endpoints invite spam. Need basic rate limits and household
  membership checks before this leaves spike.
- **Test strategy.** Two-replica spike (Stage 3) is unit-testable. Worker + DO need either a
  miniflare-style local harness or staging deployment.

## Migration Order Summary

1. Brainstorm finalized: this doc.
2. Schema migration (additive tables; move per-device fields).
3. `applyOperation` infrastructure, no transport.
4. Migrate store actions through `applyOperation`, one mutation kind at a time.
5. Two-replica correctness spike.
6. Crypto layer.
7. Cloudflare Worker + DO transport.
8. Household UX.
9. Production hardening.

Steps 2–4 are the work that pays off independently of sync (smaller store, smaller
TransactionModal, validation enforcement). Steps 5+ are sync-specific and start once the local
foundation is solid.
