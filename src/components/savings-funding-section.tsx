import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';

import { formatAmount, reverseFormatCurrency, roundMoney } from '@/src/utils/format';
import { useStore } from '@/src/store';
import { sharedTextInputProps, styles, textInputClassNames } from '../styles/text-input';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';

interface FundingRow {
	reservationId: string;
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
	/** Called whenever the total funded amount changes (toggle or amount edit) */
	onFundingChange: (totalFunded: number) => void;
}

const VISIBLE_CAP = 3;

export const SavingsFundingSection = forwardRef<SavingsFundingHandle, SavingsFundingSectionProps>(
	function SavingsFundingSection({ accountEntityId, currency, onFundingChange }, ref) {
		const [rows, setRows] = useState<FundingRow[]>([]);
		const [showAll, setShowAll] = useState(false);

		const reservations = useStore((s) => s.reservations);
		const entities = useStore((s) => s.entities);

		const accountReservations = reservations.filter(
			(r) => r.account_entity_id === accountEntityId
		);

		// Init rows once per account. accountReservations intentionally omitted from deps —
		// this component is remounted each modal session (parent gates on `visible`),
		// so stale reservation data cannot accumulate during a single session.
		useEffect(() => {
			setRows(
				accountReservations.map((r) => ({
					reservationId: r.id,
					savingEntityId: r.saving_entity_id,
					enabled: false,
					amount: '',
					maxAmount: r.amount,
				}))
			);
			onFundingChange(0);
			setShowAll(false);
		}, [accountEntityId]);

		// Report total funded whenever rows change
		useEffect(() => {
			const total = rows
				.filter((r) => r.enabled)
				.reduce((sum, r) => {
					const parsed = reverseFormatCurrency(r.amount, currency);
					return sum + Math.min(roundMoney(parsed > 0 ? parsed : 0), r.maxAmount);
				}, 0);
			onFundingChange(roundMoney(total));
		}, [rows]);

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
					return {
						...r,
						enabled: willEnable,
						amount: willEnable ? roundMoney(r.maxAmount).toString() : '',
					};
				})
			);
		};

		const handleAmountChange = (index: number, value: string) => {
			setRows((prev) =>
				prev.map((r, i) => (i === index ? { ...r, amount: value } : r))
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
								key={row.reservationId}
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
										<Check
											size={13}
											color={colors.paper[50]}
											strokeWidth={3}
										/>
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
										<IconComponent
											size={11}
											color={typeColors.iconColor}
										/>
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
												{...sharedTextInputProps}
												value={row.amount}
												onChangeText={(v) =>
													handleAmountChange(index, v)
												}
												placeholder="0"
												keyboardType="numeric"
												className={
													textInputClassNames.inlineAmountInput
												}
												style={[
													styles.input,
													{ textAlign: 'right', minWidth: 48 },
												]}
												placeholderTextColor={colors.ink.placeholder}
											/>
											<Text className="ml-1 font-sans text-xs text-ink-faint">
												/ {formatAmount(row.maxAmount, currency)}
											</Text>
										</>
									) : (
										<Text className="font-sans text-sm text-ink-faint">
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
