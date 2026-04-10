import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';

import { formatAmount, reverseFormatCurrency, roundMoney } from '@/src/utils/format';
import { useStore } from '@/src/store';
import { sharedNumericTextInputProps, styles, textInputClassNames } from '../styles/text-input';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { normalizeNumericInput } from '@/src/utils/numeric-input';
import { getReservationsForAccount } from '@/src/utils/savings-transactions';

interface FundingRow {
	savingEntityId: string;
	enabled: boolean;
	amount: string;
	maxAmount: number;
}

export interface SavingsFundingHandle {
	/** Returns only the enabled rows with positive amounts, clamped to maxAmount */
	getFundedReservations(): {
		savingEntityId: string;
		fundAmount: number;
		currentReservation: number;
	}[];
}

interface SavingsFundingSectionProps {
	accountEntityId: string;
	currency: string;
	/** Current entered transaction amount — used as default when toggling a goal on */
	enteredAmount: number;
	/** Called whenever the total funded amount changes (toggle or amount edit) */
	onFundingChange: (totalFunded: number) => void;
}

const VISIBLE_CAP = 3;

export const SavingsFundingSection = forwardRef<SavingsFundingHandle, SavingsFundingSectionProps>(
	function SavingsFundingSection(
		{ accountEntityId, currency, enteredAmount, onFundingChange },
		ref
	) {
		const [rows, setRows] = useState<FundingRow[]>([]);
		const [showAll, setShowAll] = useState(false);

		const transactions = useStore((s) => s.transactions);
		const entities = useStore((s) => s.entities);

		// Derive per-saving reservation amounts from transactions
		const accountReservations = useMemo(
			() => getReservationsForAccount(transactions, entities, accountEntityId),
			[transactions, entities, accountEntityId]
		);

		// Rebuild rows when the account or its available reservations change.
		useEffect(() => {
			setRows(
				accountReservations.map((r) => ({
					savingEntityId: r.savingEntityId,
					enabled: false,
					amount: '',
					maxAmount: r.amount,
				}))
			);
			onFundingChange(0);
			setShowAll(false);
		}, [accountReservations, onFundingChange]);

		// Report total funded whenever rows change
		useEffect(() => {
			const total = rows
				.filter((r) => r.enabled)
				.reduce((sum, r) => {
					const parsed = reverseFormatCurrency(r.amount, currency);
					return sum + Math.min(roundMoney(parsed > 0 ? parsed : 0), r.maxAmount);
				}, 0);
			onFundingChange(roundMoney(total));
		}, [rows, currency, onFundingChange]);

		useImperativeHandle(ref, () => ({
			getFundedReservations() {
				return rows
					.filter((r) => r.enabled && reverseFormatCurrency(r.amount, currency) > 0)
					.map((r) => {
						const parsed = roundMoney(reverseFormatCurrency(r.amount, currency));
						return {
							savingEntityId: r.savingEntityId,
							// Clamp to the reservation max so users can't over-release
							fundAmount: Math.min(parsed, r.maxAmount),
							currentReservation: r.maxAmount,
						};
					});
			},
		}));

		if (accountReservations.length === 0) return null;

		const handleToggle = (index: number) => {
			setRows((prev) =>
				prev.map((r, i) => {
					if (i !== index) return r;
					const willEnable = !r.enabled;
					const defaultAmount = Math.min(
						enteredAmount > 0 ? enteredAmount : r.maxAmount,
						r.maxAmount
					);
					return {
						...r,
						enabled: willEnable,
						amount: willEnable ? roundMoney(defaultAmount).toString() : '',
					};
				})
			);
		};

		const handleAmountChange = (index: number, value: string) => {
			setRows((prev) =>
				prev.map((r, i) =>
					i === index ? { ...r, amount: normalizeNumericInput(value) } : r
				)
			);
		};

		const hiddenCount = rows.length - VISIBLE_CAP;
		const visibleRows = showAll ? rows : rows.slice(0, VISIBLE_CAP);

		return (
			<View className="mb-6">
				<Text className="mb-2 font-sans text-sm uppercase tracking-wider text-ink-muted">
					Fund from savings
				</Text>

				<View className="overflow-hidden rounded-lg border border-paper-300 bg-paper-100">
					{visibleRows.map((row, index) => {
						const savingEntity = entities.find((e) => e.id === row.savingEntityId);
						if (!savingEntity) return null;

						const typeColors = getEntityTypeColors(savingEntity.type);
						const IconComponent = getIcon(savingEntity.icon || 'circle');

						return (
							<Pressable
								key={row.savingEntityId}
								onPress={() => handleToggle(index)}
								className="flex-row items-center px-3 py-2.5"
								style={
									index > 0
										? {
												borderTopWidth: 1,
												borderTopColor: colors.border.light,
											}
										: undefined
								}
							>
								{/* Checkbox */}
								<View
									className={`mr-2.5 h-5 w-5 items-center justify-center rounded ${
										row.enabled
											? 'bg-accent'
											: 'border border-paper-300 bg-paper-200'
									}`}
								>
									{row.enabled && (
										<Check size={13} color={colors.paper[50]} strokeWidth={3} />
									)}
								</View>

								{/* Entity chip */}
								<View
									className="mr-3 flex-row items-center rounded-full bg-paper-200 px-2 py-1"
									style={{ maxWidth: 120, flexShrink: 1 }}
								>
									<View
										className={`mr-1.5 h-5 w-5 items-center justify-center rounded-full ${typeColors.bg}`}
									>
										<IconComponent size={11} color={typeColors.iconColor} />
									</View>
									<Text
										className="font-sans text-sm text-ink"
										numberOfLines={1}
										style={{ flexShrink: 1 }}
									>
										{savingEntity.name}
									</Text>
								</View>

								{/* Amount + max label */}
								<View className="flex-1 flex-row items-center justify-end">
									{row.enabled ? (
										<>
											<TextInput
												{...sharedNumericTextInputProps}
												value={row.amount}
												onChangeText={(v) => handleAmountChange(index, v)}
												placeholder="0"
												keyboardType="numeric"
												className={textInputClassNames.inlineAmountInput}
												style={[
													styles.input,
													{ textAlign: 'right', minWidth: 48 },
												]}
												placeholderTextColor={colors.ink.placeholder}
											/>
											<Text className="text-ink-faint ml-1 font-sans text-xs">
												/ {formatAmount(row.maxAmount, currency)}
											</Text>
										</>
									) : (
										<Text className="text-ink-faint font-sans text-sm">
											{formatAmount(row.maxAmount, currency)}
										</Text>
									)}
								</View>
							</Pressable>
						);
					})}
					{hiddenCount > 0 && (
						<Pressable
							onPress={() => setShowAll(!showAll)}
							className="flex-row items-center justify-center px-3 py-2"
							style={{
								borderTopWidth: 1,
								borderTopColor: colors.border.light,
							}}
						>
							{showAll ? (
								<ChevronUp size={14} color={colors.ink.muted} />
							) : (
								<ChevronDown size={14} color={colors.ink.muted} />
							)}
							<Text className="ml-1.5 font-sans text-sm text-ink-muted">
								{showAll ? 'Show less' : `${hiddenCount} more`}
							</Text>
						</Pressable>
					)}
				</View>
			</View>
		);
	}
);
