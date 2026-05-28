# Amount input — single-separator policy: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the amount-input pipeline from stripping commas; allow either `,` or `.` as decimal but at most one per operand; unify the main amount input and split row pipelines.

**Architecture:** Add one pure helper, `enforceSingleSeparator(value)`, in `src/utils/expression-input.ts`. Wire it into `useExpressionInput.setValue` (replaces eager `normalizeDecimalSeparator`) and into `handleSplitAmountChange` in `transaction-modal.tsx` (composed with the existing `normalizeNumericInput`). Normalize commas only at the evaluator boundary inside the hook (`evaluateExpression` is `.`-only). `reverseFormatCurrency` already accepts both separators.

**Tech Stack:** TypeScript, React Native, Bun (unit tests, `bun test`), Jest (component tests, `bunx jest`), oxlint, oxfmt, tsgo.

**Spec:** `docs/2026-05-28-amount-input-single-separator-design.md`

**Branch (already created):** `fix/amount-input-single-separator` in worktree `/Users/alex/Code/kopiika/.worktrees/fix-amount-input/`

---

## File map

| File                                                  | Action | Why                                                                                                                 |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `src/utils/expression-input.ts`                       | Modify | Add `enforceSingleSeparator(value: string): string`                                                                 |
| `src/utils/__tests__/expression-input.test.ts`        | Modify | Unit tests for the new helper                                                                                       |
| `src/hooks/use-expression-input.ts`                   | Modify | Replace `normalizeDecimalSeparator` in `setValue`; wrap `evaluateExpression` calls with `normalizeDecimalSeparator` |
| `src/components/transaction-modal.tsx`                | Modify | `handleSplitAmountChange` composes `enforceSingleSeparator` with `normalizeNumericInput`                            |
| `src/components/__tests__/transaction-modal.test.tsx` | Modify | Flip 3 interaction tests, add 3 new ones                                                                            |

No new files. No dependencies. No native changes.

---

## Task 1: `enforceSingleSeparator` helper (TDD)

**Files:**

- Modify: `src/utils/expression-input.ts`
- Test: `src/utils/__tests__/expression-input.test.ts`

### Step 1.1 — Write the failing unit tests

- [ ] Open `src/utils/__tests__/expression-input.test.ts` and append a new `describe` block at the bottom:

```ts
import { enforceSingleSeparator } from '../expression-input';

describe('enforceSingleSeparator', () => {
	test('passes through empty input', () => {
		expect(enforceSingleSeparator('')).toBe('');
	});

	test('passes through plain integer', () => {
		expect(enforceSingleSeparator('100')).toBe('100');
	});

	test('passes through a single decimal with period', () => {
		expect(enforceSingleSeparator('100.5')).toBe('100.5');
	});

	test('passes through a single decimal with comma', () => {
		expect(enforceSingleSeparator('100,5')).toBe('100,5');
	});

	test('drops a second separator of the same kind', () => {
		expect(enforceSingleSeparator('100,5,3')).toBe('100,53');
		expect(enforceSingleSeparator('100.5.3')).toBe('100.53');
	});

	test('drops a second separator of a different kind', () => {
		expect(enforceSingleSeparator('100,5.3')).toBe('100,53');
		expect(enforceSingleSeparator('100.5,3')).toBe('100.53');
	});

	test('allows one separator per operand in an expression', () => {
		expect(enforceSingleSeparator('100,5+50,3')).toBe('100,5+50,3');
		expect(enforceSingleSeparator('100.5+50.3')).toBe('100.5+50.3');
	});

	test('drops the second separator within a single operand of an expression', () => {
		expect(enforceSingleSeparator('100,5,3+50')).toBe('100,53+50');
	});

	test('preserves a leading sign', () => {
		expect(enforceSingleSeparator('-5,3')).toBe('-5,3');
	});

	test('preserves a leading separator', () => {
		expect(enforceSingleSeparator(',5')).toBe(',5');
		expect(enforceSingleSeparator('.5')).toBe('.5');
	});

	test('handles a parenthesised sub-expression', () => {
		expect(enforceSingleSeparator('(5,3)')).toBe('(5,3)');
		expect(enforceSingleSeparator('(5,3+2,1)')).toBe('(5,3+2,1)');
	});

	test('handles unicode operators × and ÷', () => {
		expect(enforceSingleSeparator('5,3×2')).toBe('5,3×2');
		expect(enforceSingleSeparator('5,3÷2,1')).toBe('5,3÷2,1');
	});
});
```

### Step 1.2 — Run the tests, expect them to FAIL

- [ ] Run from the worktree root:

```bash
cd /Users/alex/Code/kopiika/.worktrees/fix-amount-input
bun test src/utils/__tests__/expression-input.test.ts
```

Expected: every `enforceSingleSeparator` test fails with `Export named 'enforceSingleSeparator' not found in module`. Other tests in the file still pass.

### Step 1.3 — Implement `enforceSingleSeparator`

- [ ] Open `src/utils/expression-input.ts`. After the existing `normalizeDecimalSeparator` export at the bottom, append:

```ts
/**
 * Walks the candidate input and, for each operand chunk (delimited by the
 * arithmetic operator characters), allows at most one decimal separator
 * (either `,` or `.`). A second separator typed within the same operand is
 * dropped. Operator characters themselves are preserved verbatim, including
 * a leading `-` which is treated as a sign on the following operand.
 *
 * Used by the amount input pipeline so the user can type either separator
 * without it being silently converted on every keystroke, while still
 * preventing nonsense like `100,5,3` or `100,5.3` from accumulating.
 */
const OPERATOR_CHARS = new Set<string>(['+', '-', '−', '×', '÷', '(', ')']);
const OPERATOR_SPLIT_RE = /([+\-−×÷()])/;

export function enforceSingleSeparator(value: string): string {
	if (!value) return value;
	return value
		.split(OPERATOR_SPLIT_RE)
		.map((part) => {
			// Operator chars come through as standalone 1-char segments after split.
			if (part.length === 1 && OPERATOR_CHARS.has(part)) return part;
			let seenSep = false;
			let out = '';
			for (const ch of part) {
				if (ch === '.' || ch === ',') {
					if (seenSep) continue;
					seenSep = true;
				}
				out += ch;
			}
			return out;
		})
		.join('');
}
```

### Step 1.4 — Run the tests, expect PASS

- [ ] Run:

```bash
bun test src/utils/__tests__/expression-input.test.ts
```

Expected: all `enforceSingleSeparator` tests pass. No other test regresses.

### Step 1.5 — Commit

- [ ] Stage and commit:

```bash
git add src/utils/expression-input.ts src/utils/__tests__/expression-input.test.ts
git commit -m "feat(expression-input): add enforceSingleSeparator helper

Pure function that walks an amount-input candidate value and, for each
operand chunk (separated by the arithmetic operators), allows at most one
decimal separator (either ',' or '.'). A second separator typed in the
same operand is dropped. Foundation for the single-separator input policy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Main amount field — stop normalizing commas (TDD)

**Files:**

- Modify: `src/hooks/use-expression-input.ts`
- Modify: `src/components/__tests__/transaction-modal.test.tsx`

### Step 2.1 — Flip the existing interaction tests so they expect the new behavior

- [ ] Open `src/components/__tests__/transaction-modal.test.tsx`. Find the existing `describe('Amount input pipeline (interaction)', ...)` block (it was added by PR #67).

- [ ] Replace the two `SYMPTOM 1` tests with the post-fix expectations. Find this:

```ts
		it('SYMPTOM 1 — main field: typing a single comma displays as period', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, ',');
			// Pre-existing: useExpressionInput.setValue runs
			// normalizeDecimalSeparator (',' → '.') before storing.
			expect(input.props.value).toBe('.');
		});

		it('SYMPTOM 1 — main field: typing "100,5" stored as "100.5"', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '100,5');
			expect(input.props.value).toBe('100.5');
		});
```

Replace with:

```ts
		it('main field: typing a single comma preserves the comma', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, ',');
			// New policy: no eager normalization; user's typed character is preserved.
			expect(input.props.value).toBe(',');
		});

		it('main field: typing "100,5" preserves the comma', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '100,5');
			expect(input.props.value).toBe('100,5');
		});
```

- [ ] Just below those two, add two new tests that cover the single-separator rule:

```ts
		it('main field: typing "100,5." drops the trailing period (single separator rule)', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '100,5.');
			expect(input.props.value).toBe('100,5');
		});

		it('main field: typing "100.5," drops the trailing comma (single separator rule)', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '100.5,');
			expect(input.props.value).toBe('100.5');
		});
```

### Step 2.2 — Run the tests, expect the flipped tests to FAIL

- [ ] Run:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal -t "main field: typing"
```

Expected: all four `main field: typing` tests FAIL — the two flipped ones because the hook still normalizes commas, and the two new ones for the same reason (their trailing separators get the prior one converted too).

### Step 2.3 — Replace eager normalization in `setValue` with `enforceSingleSeparator`

- [ ] Open `src/hooks/use-expression-input.ts`. Update the imports at the top:

```ts
import {
	tryInsertOperator,
	normalizeDecimalSeparator,
	enforceSingleSeparator,
} from '@/src/utils/expression-input';
```

- [ ] Replace the `setValue` callback (currently lines 37-45):

```ts
const setValue = useCallback(
	(v: string) => {
		const next = enforceSingleSeparator(v);
		onChange(EXPR_CHAR_RE.test(next) ? next : normalizeNumericInput(next));
	},
	[onChange]
);
```

(`normalizeDecimalSeparator` is no longer called eagerly. It stays in scope because Task 3 still uses it at the evaluator boundary.)

### Step 2.4 — Run the tests, expect PASS

- [ ] Run:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal -t "main field: typing"
```

Expected: all four `main field: typing` tests pass. No other modal test regresses — run the full modal suite to confirm:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal
```

Expected: all tests in the file pass.

### Step 2.5 — Commit

- [ ] Stage and commit:

```bash
git add src/hooks/use-expression-input.ts src/components/__tests__/transaction-modal.test.tsx
git commit -m "fix(amount-input): preserve user's typed decimal separator in main field

useExpressionInput.setValue no longer converts commas to periods on every
keystroke. The user types ',' and sees ',' — agreeing with the locale-aware
display labels (\`120,00\`) shown elsewhere in the app. Two further keystrokes
of any separator are dropped via enforceSingleSeparator, so at most one
decimal separator survives per operand.

Flips the two SYMPTOM 1 interaction tests added in PR #67 and adds two new
ones covering the single-separator rule for trailing typed separators.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Expression evaluator still works with commas (TDD)

**Files:**

- Modify: `src/hooks/use-expression-input.ts`
- Modify: `src/components/__tests__/transaction-modal.test.tsx`

### Step 3.1 — Add the failing test

- [ ] In `src/components/__tests__/transaction-modal.test.tsx`, append inside the `describe('Amount input pipeline (interaction)', ...)` block, right after the two new single-separator tests from Task 2:

```ts
		it('main field: expression with comma operands evaluates correctly', () => {
			// User types "100,5+50,3" — both operands keep their commas (Task 2),
			// and the calculator preview / resolved value still uses the .-only
			// evaluator under the hood by normalizing at the boundary.
			const { getByTestId, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '100,5+50,3');
			expect(input.props.value).toBe('100,5+50,3');
			// useExpressionInput exposes `preview` for the resolved value via
			// formatAmount — in en-US that renders as "150.80".
			expect(queryByText('= 150.80')).toBeTruthy();
		});
```

### Step 3.2 — Run the test, expect FAIL

- [ ] Run:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal -t "expression with comma operands"
```

Expected: FAIL. The expression contains commas; `evaluateExpression` returns `null` because its grammar accepts only `.` for decimals. The preview text `= 150.80` is not rendered.

### Step 3.3 — Wrap `evaluateExpression` calls with `normalizeDecimalSeparator`

- [ ] In `src/hooks/use-expression-input.ts`, find the two `evaluateExpression(value)` call sites and replace them.

The `preview` memo (currently around line 30-35):

```ts
const preview = useMemo(() => {
	if (!isExpression) return null;
	const result = evaluateExpression(normalizeDecimalSeparator(value));
	if (result === null) return null;
	return `= ${formatAmount(result)}`;
}, [value, isExpression]);
```

The `resolve` callback (currently around line 47-54):

```ts
const resolve = useCallback((): string => {
	if (!isExpression) return value;
	const evaluated = evaluateExpression(normalizeDecimalSeparator(value));
	if (evaluated === null) return value;
	const resolved = evaluated.toString();
	onChange(resolved);
	return resolved;
}, [value, isExpression, onChange]);
```

### Step 3.4 — Run the test, expect PASS

- [ ] Run:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal -t "expression with comma operands"
```

Expected: PASS. Then run the full modal suite to check no regressions:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal
```

Expected: all pass.

### Step 3.5 — Commit

- [ ] Stage and commit:

```bash
git add src/hooks/use-expression-input.ts src/components/__tests__/transaction-modal.test.tsx
git commit -m "fix(amount-input): normalize commas only at evaluator boundary

evaluateExpression has a .-only number grammar. With Task 2 letting users
type 100,5+50,3 in the input, the evaluator was returning null and the
preview disappeared. Wrap both evaluator call sites in the hook with
normalizeDecimalSeparator so the user-facing value keeps its commas while
the evaluator sees a parseable string.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Split rows use the single-separator rule (TDD)

**Files:**

- Modify: `src/components/transaction-modal.tsx`
- Modify: `src/components/__tests__/transaction-modal.test.tsx`

### Step 4.1 — Add the failing test

- [ ] In `src/components/__tests__/transaction-modal.test.tsx`, locate the existing `SYMPTOM 3 — split row: typing comma is NOT normalized (asymmetry vs main)` test inside `describe('Amount input pipeline (interaction)', ...)`. Replace it with two tests — one re-framing the comma-preserving behavior as a positive contract, and one new for the single-separator rule:

```ts
		it('split row: typing "5,3" preserves the comma (same rule as main field)', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
			fireEvent.press(getByTestId('split-toggle-button'));
			const splitInput = getByTestId('split-amount-1');
			fireEvent.changeText(splitInput, '5,3');
			expect(splitInput.props.value).toBe('5,3');
		});

		it('split row: typing "5,3." drops the trailing period (single separator rule)', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
			fireEvent.press(getByTestId('split-toggle-button'));
			const splitInput = getByTestId('split-amount-1');
			fireEvent.changeText(splitInput, '5,3.');
			expect(splitInput.props.value).toBe('5,3');
		});
```

### Step 4.2 — Run the tests, expect the new one to FAIL

- [ ] Run:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal -t "split row: typing"
```

Expected: the `"5,3"` test passes (split rows already preserve commas — `handleSplitAmountChange` doesn't normalize), but the `"5,3."` test FAILS (it lands as `5,3.` because nothing drops the trailing separator yet).

### Step 4.3 — Wire `handleSplitAmountChange` through `enforceSingleSeparator`

- [ ] In `src/components/transaction-modal.tsx`, update the imports near the top of the file. Find the `expression-input` import (around line 26 if `sharedNumericTextInputProps` is imported from `@/src/styles/text-input`; the actual line with `normalizeDecimalSeparator` / `tryInsertOperator` may be elsewhere — search for it):

```bash
grep -n "from '@/src/utils/expression-input'" src/components/transaction-modal.tsx
```

- [ ] Add `enforceSingleSeparator` to the import:

```ts
import { enforceSingleSeparator, normalizeDecimalSeparator } from '@/src/utils/expression-input';
```

(Adjust to whatever the existing import shape is; merge the new name in alphabetically.)

- [ ] Find `handleSplitAmountChange` (around line 330):

```ts
const handleSplitAmountChange = (index: number, value: string) => {
	if (index === 0) return;
	setSplits((prev) =>
		prev.map((s, i) => (i === index ? { ...s, amount: normalizeNumericInput(value) } : s))
	);
};
```

Replace with:

```ts
const handleSplitAmountChange = (index: number, value: string) => {
	if (index === 0) return;
	setSplits((prev) =>
		prev.map((s, i) =>
			i === index ? { ...s, amount: normalizeNumericInput(enforceSingleSeparator(value)) } : s
		)
	);
};
```

### Step 4.4 — Run the tests, expect PASS

- [ ] Run:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal -t "split row: typing"
```

Expected: both tests pass.

Then run the full modal suite:

```bash
bunx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern=transaction-modal
```

Expected: all pass.

### Step 4.5 — Commit

- [ ] Stage and commit:

```bash
git add src/components/transaction-modal.tsx src/components/__tests__/transaction-modal.test.tsx
git commit -m "fix(amount-input): apply single-separator rule to split rows

handleSplitAmountChange now composes enforceSingleSeparator with the
existing normalizeNumericInput. Same rule as the main amount field after
Task 2: at most one decimal separator (either ',' or '.') per row, the
user's typed character preserved. Removes the main-vs-split asymmetry
that PR #67's SYMPTOM 3 test documented.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full gate + PR

### Step 5.1 — Run the full gate

- [ ] Run, in order, from the worktree root:

```bash
bun run test:unit
```

Expected: all pass (Bun unit tests: format, expression-input, recurrence, etc.).

```bash
bunx jest --testPathIgnorePatterns=/node_modules/
```

Expected: all pass (Jest component/screen tests). The worktree-path override is required because the project's `jest.config.js` ignores `\.worktrees/` by default.

```bash
bun run lint
```

Expected: `Found 0 warnings and 0 errors.`

```bash
bun run fmt:check
```

Expected: `All matched files use the correct format.`

```bash
bun run types
```

Expected: silent exit (tsgo emits nothing on success).

### Step 5.2 — Push the branch

- [ ] Push:

```bash
git push -u origin fix/amount-input-single-separator
```

### Step 5.3 — Open the PR via `fj` (Forgejo CLI — this repo is on Codeberg, not GitHub)

- [ ] Write the PR body to `/tmp/pr-amount-input.md`:

```markdown
## What

The amount input pipeline was stripping commas to periods on every keystroke (`useExpressionInput.setValue:39`), so on comma-locale devices the user typed `,` and saw `.` immediately — while every display label in the app shows commas. The split row pipeline had a different problem: it didn't normalize separators at all, allowing multiple `,`/`.` to accumulate side by side.

This PR establishes a single, consistent policy across both inputs: **at most one decimal separator per operand, either `,` or `.`, preserved as-typed**.

## Changes

1. **New helper** `enforceSingleSeparator` in `src/utils/expression-input.ts` — pure, table-tested. Walks the candidate value, splits on operator chars, drops every separator after the first within each operand chunk.
2. **`useExpressionInput.setValue`** no longer eagerly converts `,` to `.`. It passes the candidate through `enforceSingleSeparator` and then either preserves it (for arithmetic expressions) or runs `normalizeNumericInput`.
3. **`evaluateExpression` calls inside the hook** are wrapped with `normalizeDecimalSeparator` so the `.`-only evaluator grammar still works for users typing `100,5+50,3`.
4. **`handleSplitAmountChange`** composes `enforceSingleSeparator` with `normalizeNumericInput`, so split rows follow the same rule.

## Out of scope

- `splitTotal` stays a `number`. The interaction test pinning `split-mode main: '5,' → '5'` (lossy partial decimal) remains green; that's an architectural change deferred.
- Native iOS blur behavior (the "blur strips `.`" symptom from earlier) was not reproducible after PR #67 merged and is not chased here.

## Verify

- `bun run test:unit` → all pass (+12 new unit tests for `enforceSingleSeparator`)
- `bunx jest` → all pass (3 flipped + 3 new interaction tests in transaction-modal.test.tsx)
- `bun run lint` / `bun run fmt:check` / `bun run types` clean

Manual on device (Metro reload, no native rebuild):

- Comma-locale device: typing `100,5` keeps the `,`.
- Typing `100,5.` keeps `100,5` (trailing period dropped).
- Typing `100,5+50,3` shows the preview `= 150.80` and saves correctly.
- Split rows behave the same as the main field.

Spec: `docs/2026-05-28-amount-input-single-separator-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] Open the PR:

```bash
fj pr create "fix(amount-input): single-separator policy across main + split rows" \
  --base main --head fix/amount-input-single-separator \
  --body-file /tmp/pr-amount-input.md
```

Expected: `created pull request #NN: ...`

### Step 5.4 — Mark the implementation task complete and report

- [ ] Update task #9 to completed.
- [ ] Report the PR number, branch, files-changed list, and test counts (before/after).

---

## Self-review (already done; included for the executor's reference)

- **Spec coverage:** policy in Task 1+2; unified pipeline in Tasks 2 and 4; evaluator-boundary normalization in Task 3; `splitTotal=number` left untouched per spec.
- **Placeholders:** none.
- **Type consistency:** `enforceSingleSeparator` signature and call sites match across tasks.
- **Ambiguity:** the operator regex and `OPERATOR_CHARS` set are defined exactly once and reused.
