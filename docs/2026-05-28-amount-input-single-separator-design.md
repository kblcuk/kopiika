# Amount input — single-separator policy

**Date:** 2026-05-28
**Branch:** `fix/amount-input-single-separator`
**Status:** Approved — ready for implementation plan
**Related:** PR #67 (merged) added the 6 interaction tests this spec flips.

## Problem

Three bugs in the amount input pipeline, all observed on a comma-locale device:

1. Typing `,` is replaced with `.` on first keystroke (`useExpressionInput.setValue:39` calls `normalizeDecimalSeparator` eagerly).
2. ~~Blur strips a trailing `.`.~~ (Could not reproduce after PR #67 merge — out of scope.)
3. Split row inputs and the main amount input go through different pipelines (`handleSplitAmountChange` skips decimal-separator handling), so their behavior diverges.

Underlying ugliness: display labels render locale-aware (`120,00`) while inputs force `.`. The app shows the user a comma everywhere except the field they have to type into.

## Policy

**One decimal separator per operand. Either `,` or `.`. Preserved as-typed. No conversion on input.**

- Both characters are accepted equally as decimal separators.
- After the first separator in an operand, any further `.` or `,` typed in the same operand is dropped.
- Display labels keep their locale-aware formatting (`formatAmount`). Inputs preserve the user's typed character verbatim.
- Locale detection does NOT drive what's accepted.

## Design

### 1. Stop normalizing on type

In `src/hooks/use-expression-input.ts`, `setValue` (line 37):

- Remove the unconditional `normalizeDecimalSeparator(v)` call.
- Replace with a new `enforceSingleSeparator(value)` step that walks the candidate value, splitting on `OPERATOR_SPLIT_RE = /([+\-−×÷()])/` so the input is partitioned into operand chunks (the operator characters between them are preserved verbatim). In each chunk, allows at most one decimal-separator character (either `.` or `,`). A second separator typed in the same chunk is dropped; the rest of the value survives. The minus character is treated as a sign at the start of a chunk, not as an operator (a chunk like `-5,3` has one separator). Signature is single-arg (not `(prev, next)`); left-to-right scanning of `value` naturally keeps the first separator seen, which is equivalent to "preserve the existing separator and drop newly typed extras" for the cases that arise from incremental keystrokes.
- The result of `enforceSingleSeparator` is then passed through the existing branching: expression characters → keep as-is, else → `normalizeNumericInput`.

### 2. Unify split rows with the main pipeline

In `src/components/transaction-modal.tsx:330`, `handleSplitAmountChange`:

- Compose the same `enforceSingleSeparator` step before the existing `normalizeNumericInput`. The previous-value argument comes from `splits[index].amount`.
- Extract the combined `(prev, next) => string` transformation into a shared helper in `src/utils/expression-input.ts` so both call sites use the same code path.

### 3. Normalize only at the boundary

Two narrow spots where the evaluator/parser is `.`-only:

- `evaluateExpression(value)` calls in `useExpressionInput` (lines 32, 49): wrap with `normalizeDecimalSeparator` (`evaluateExpression(normalizeDecimalSeparator(value))`). The evaluator itself stays simple.
- `reverseFormatCurrency(value)` — **no change**. The function already accepts either separator (`src/utils/format.ts:60-105`).

`normalizeDecimalSeparator` survives as a helper in `src/utils/expression-input.ts`; it just isn't called eagerly from `setValue` anymore.

## What we don't change

- **`splitTotal` stays a `number`.** Split-mode main field still can't hold a partial decimal like `5,` mid-typing (it round-trips through a number, dropping the trailing separator). The interaction test from PR #67 documents this; replacing the `number` with a `string` is an architectural change with broader implications, deferred.
- **Display labels.** Still locale-aware via `formatAmount`.
- **Native iOS blur.** No reproducible bug; no speculation.
- **Other consumers of `useExpressionInput`** (`entity-create-modal`, `entity-detail-modal`, `reservation-modal`). They get the new behavior transparently — no per-consumer changes.

## Tests (TDD-driven)

The 6 interaction tests in `src/components/__tests__/transaction-modal.test.tsx` from PR #67 are the starting point. The new behavior FLIPS three of them:

| Existing test                                        | After this change                                        |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `SYMPTOM 1 — main: typing ',' displays as period`    | **Flip:** typing `,` displays as `,`                     |
| `SYMPTOM 1 — main: typing '100,5' stored as '100.5'` | **Flip:** typing `100,5` stored as `100,5`               |
| `SYMPTOM 2 — main: blur does NOT mutate '100.'`      | Unchanged (already passes; pins JS-side)                 |
| `SYMPTOM 3 — split row: comma is NOT normalized`     | **Re-framed:** now a contract, not anomaly               |
| `split-mode main: '5,' → '5'`                        | Unchanged (number-bound, still lossy)                    |
| `split-mode main: '5,3' → '5.3'`                     | **Flip:** `5,3` → `5,3` (still parses to 5.3 internally) |

New tests:

- Unit (`src/utils/__tests__/expression-input.test.ts`): `enforceSingleSeparator` table-driven cases.
    - empty operand: `''` → `''`
    - single sep: `100,5` → `100,5`, `100.5` → `100.5`
    - second sep same char: `100,5,3` → drops the extra
    - second sep different char: `100,5.3` → drops the `.` (or the second one)
    - across operators: `100,5+50,3` → both survive
    - operand starting with sep: `,5` → `,5`
- Component (`transaction-modal.test.tsx`):
    - main: typing `100,5.` keeps `100,5` (second sep dropped)
    - main: typing `100.5,` keeps `100.5` (second sep dropped)
    - main: typing `100,5+50,3` produces the expected expression preview (`= 150,80` via `formatAmount`) and resolves to `150.8` on save
    - split row: typing `100,5.` keeps `100,5` (same rule)

## File changes summary

| File                                                  | Change                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/utils/expression-input.ts`                       | + `enforceSingleSeparator(value)` — drops extra separators per operand                          |
| `src/hooks/use-expression-input.ts`                   | `setValue` uses new helper; `evaluateExpression` calls wrapped with `normalizeDecimalSeparator` |
| `src/components/transaction-modal.tsx`                | `handleSplitAmountChange` composes `enforceSingleSeparator` with `normalizeNumericInput`        |
| `src/utils/__tests__/expression-input.test.ts`        | + unit tests for `enforceSingleSeparator`                                                       |
| `src/components/__tests__/transaction-modal.test.tsx` | Flip 3 interaction tests, add 4 new ones                                                        |

No new dependencies. No DB / native changes.

## Acceptance

The full gate must pass:

- `bun run test:unit`
- `bun run test:component` (jest)
- `bun run lint`
- `bun run fmt:check`
- `bun run types`

Manual verification on device (Metro reload, no native rebuild):

- Comma-locale device: typing `100,5` in main amount keeps the `,`.
- Typing `100,5.` in main amount keeps `100,5`.
- Same in a split row.
- Typing `100,5+50,3` evaluates to a number on save (no breakage).
- Display labels still show locale-aware separators (unchanged).
