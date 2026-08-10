import { useMemo } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text } from '@/src/components/text';
import { TestIDs } from '@/e2e/support/test-ids';
import { formatAmount } from '@/src/utils/format';
import { parseBankRows } from '@/src/utils/bank-import/parse-rows';
import type { ColumnMapping, DateFormat, DetectionResult } from '@/src/utils/bank-import/types';

const DATE_FORMATS: DateFormat[] = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];

interface StepMapColumnsProps {
	rawText: string;
	mapping: ColumnMapping;
	headers: string[];
	currency: string;
	/** Detection confidence per field; renders a "please verify" hint when false. */
	confident?: DetectionResult['confident'];
	onChange: (next: ColumnMapping) => void;
	onConfirm: () => void;
}

/** Subtle inline hint shown next to a section whose detection wasn't confident. */
function LowConfidenceHint() {
	return (
		<Text className="mb-1 mt-0.5 font-sans text-xs text-warning">
			Couldn&apos;t confidently detect this — please verify.
		</Text>
	);
}

function ChipRow<T extends string | number>({
	values,
	selected,
	label,
	onSelect,
}: {
	values: T[];
	selected: T;
	label: (v: T) => string;
	onSelect: (v: T) => void;
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			className="flex-row gap-2 py-1"
		>
			{values.map((v) => (
				<Pressable
					key={String(v)}
					onPress={() => onSelect(v)}
					className={`mr-2 rounded-full px-3 py-1.5 ${v === selected ? 'bg-ink' : 'bg-paper-200'}`}
				>
					<Text
						className={`font-sans text-sm ${v === selected ? 'text-paper-50' : 'text-ink'}`}
					>
						{label(v)}
					</Text>
				</Pressable>
			))}
		</ScrollView>
	);
}

export function StepMapColumns({
	rawText,
	mapping,
	headers,
	currency,
	confident,
	onChange,
	onConfirm,
}: StepMapColumnsProps) {
	const columns = headers.map((_, i) => i);
	const columnLabel = (c: number) => headers[c] ?? `Column ${c + 1}`;
	const amount = mapping.amount;
	const preview = useMemo(
		() => parseBankRows(rawText, mapping).rows.slice(0, 3),
		[rawText, mapping]
	);

	return (
		<View className="flex-1 px-5">
			<ScrollView className="flex-1">
				<Text className="mb-1 mt-4 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Date column
				</Text>
				{confident && !confident.date ? <LowConfidenceHint /> : null}
				<ChipRow
					values={columns}
					selected={mapping.dateColumn}
					label={columnLabel}
					onSelect={(c) => onChange({ ...mapping, dateColumn: c })}
				/>
				<Text className="mb-1 mt-4 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Date format
				</Text>
				<ChipRow
					values={DATE_FORMATS}
					selected={mapping.dateFormat}
					label={(f) => f}
					onSelect={(f) => onChange({ ...mapping, dateFormat: f })}
				/>

				<Text className="mb-1 mt-4 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Amount
				</Text>
				{confident && !confident.amount ? <LowConfidenceHint /> : null}
				<ChipRow
					values={['signed', 'debitCredit'] as const}
					selected={amount.kind}
					label={(k) =>
						k === 'signed' ? 'Single signed column' : 'Separate debit / credit'
					}
					onSelect={(k) =>
						onChange({
							...mapping,
							amount:
								k === 'signed'
									? {
											kind: 'signed',
											column: amount.kind === 'signed' ? amount.column : 0,
										}
									: { kind: 'debitCredit', debitColumn: 0, creditColumn: 1 },
						})
					}
				/>
				{amount.kind === 'signed' ? (
					<ChipRow
						values={columns}
						selected={amount.column}
						label={columnLabel}
						onSelect={(c) =>
							onChange({ ...mapping, amount: { kind: 'signed', column: c } })
						}
					/>
				) : (
					<>
						<Text className="mt-2 font-sans text-xs text-ink-muted">Debit (out)</Text>
						<ChipRow
							values={columns}
							selected={amount.debitColumn}
							label={columnLabel}
							onSelect={(c) =>
								onChange({
									...mapping,
									amount: {
										kind: 'debitCredit',
										debitColumn: c,
										creditColumn: amount.creditColumn,
									},
								})
							}
						/>
						<Text className="mt-2 font-sans text-xs text-ink-muted">Credit (in)</Text>
						<ChipRow
							values={columns}
							selected={amount.creditColumn}
							label={columnLabel}
							onSelect={(c) =>
								onChange({
									...mapping,
									amount: {
										kind: 'debitCredit',
										debitColumn: amount.debitColumn,
										creditColumn: c,
									},
								})
							}
						/>
					</>
				)}

				<Text className="mb-1 mt-4 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Decimal separator
				</Text>
				<ChipRow
					values={['.', ','] as const}
					selected={mapping.decimalSeparator}
					label={(s) => (s === '.' ? '1,234.56' : '1.234,56')}
					onSelect={(s) => onChange({ ...mapping, decimalSeparator: s })}
				/>

				<Text className="mb-1 mt-4 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Description column
				</Text>
				<Text className="mb-1 font-sans text-xs text-ink-muted">
					Becomes each transaction&apos;s note — pick the merchant/details column.
				</Text>
				<ChipRow
					values={[-1, ...columns]}
					selected={mapping.descriptionColumn ?? -1}
					label={(c) => (c === -1 ? 'None' : columnLabel(c))}
					onSelect={(c) =>
						onChange({ ...mapping, descriptionColumn: c === -1 ? null : c })
					}
				/>

				<Text className="mb-2 mt-6 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Preview
				</Text>
				{preview.length === 0 ? (
					<Text className="font-sans text-sm text-negative">
						No rows parse with this mapping — adjust the columns above.
					</Text>
				) : (
					preview.map((r) => (
						<View
							key={r.rowIndex}
							className="flex-row items-center justify-between border-b border-paper-200 py-2"
						>
							<Text className="font-sans text-sm text-ink-muted">
								{new Date(r.dateMs).toLocaleDateString()}
							</Text>
							<Text
								className="mx-3 flex-1 font-sans text-sm text-ink"
								numberOfLines={1}
							>
								{r.description}
							</Text>
							<Text
								className={`font-sans-semibold text-sm ${r.amountMinor < 0 ? 'text-ink' : 'text-positive'}`}
							>
								{formatAmount(r.amountMinor, currency)}
							</Text>
						</View>
					))
				)}
			</ScrollView>

			<Pressable
				testID={TestIDs.importMappingNext}
				disabled={preview.length === 0}
				onPress={onConfirm}
				className={`my-4 items-center rounded-full py-3 ${preview.length === 0 ? 'bg-paper-200' : 'bg-ink'}`}
			>
				<Text
					className={`font-sans-semibold text-base ${preview.length === 0 ? 'text-ink-muted' : 'text-paper-50'}`}
				>
					Continue
				</Text>
			</Pressable>
		</View>
	);
}
