import { useState, useRef, useMemo, useCallback } from 'react';
import { TextInput } from 'react-native';

import { evaluateExpression } from '@/src/utils/evaluate-expression';
import { formatAmount } from '@/src/utils/format';
import { normalizeNumericInput } from '@/src/utils/numeric-input';
import { tryInsertOperator, normalizeDecimalSeparator } from '@/src/utils/expression-input';
import { OPERATORS, type Operator } from '@/src/components/operator-toolbar';

const EXPR_CHAR_RE = new RegExp(`[${OPERATORS.map((c) => `\\${c}`).join('')}]`);

/**
 * Hook that adds arithmetic expression support to a numeric TextInput.
 *
 * Returns props to spread onto the TextInput, the operator toolbar callbacks,
 * focus state for KeyboardExtender gating, and a resolve function for submit.
 */
export function useExpressionInput(value: string, onChange: (v: string) => void) {
	const inputRef = useRef<TextInput>(null);
	const selectionRef = useRef({ start: 0, end: 0 });
	const blurTimeout = useRef<ReturnType<typeof setTimeout>>(null);

	const [focused, setFocused] = useState(false);
	const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(
		undefined
	);

	const isExpression = EXPR_CHAR_RE.test(value);

	const preview = useMemo(() => {
		if (!isExpression) return null;
		const result = evaluateExpression(value);
		if (result === null) return null;
		return `= ${formatAmount(result)}`;
	}, [value, isExpression]);

	const setValue = useCallback(
		(v: string) => {
			const normalized = normalizeDecimalSeparator(v);
			onChange(
				EXPR_CHAR_RE.test(normalized) ? normalized : normalizeNumericInput(normalized)
			);
		},
		[onChange]
	);

	const resolve = useCallback((): string => {
		if (!isExpression) return value;
		const evaluated = evaluateExpression(value);
		if (evaluated === null) return value;
		const resolved = evaluated.toString();
		onChange(resolved);
		return resolved;
	}, [value, isExpression, onChange]);

	const insertOperator = useCallback(
		(op: Operator) => {
			const { start, end } = selectionRef.current;
			const result = tryInsertOperator(value, op, start, end);
			if (!result) return;

			setValue(result.value);
			selectionRef.current = { start: result.cursor, end: result.cursor };
			setSelection({ start: result.cursor, end: result.cursor });
			setTimeout(() => setSelection(undefined), 0);
			inputRef.current?.focus();
		},
		[value, setValue]
	);

	const onFocus = useCallback((e?: { nativeEvent: { target?: number | null } }) => {
		if (blurTimeout.current) clearTimeout(blurTimeout.current);
		setFocused(true);
		return e;
	}, []);

	const onBlur = useCallback(() => {
		blurTimeout.current = setTimeout(() => setFocused(false), 150);
	}, []);

	const onSelectionChange = useCallback(
		(e: { nativeEvent: { selection: { start: number; end: number } } }) => {
			selectionRef.current = e.nativeEvent.selection;
		},
		[]
	);

	return {
		inputRef,
		focused,
		preview,
		resolve,
		insertOperator,
		/** Props to spread onto the TextInput */
		inputProps: {
			ref: inputRef,
			value,
			selection,
			onChangeText: setValue,
			onSelectionChange,
			onFocus,
			onBlur,
			keyboardType: 'decimal-pad' as const,
		},
	};
}
