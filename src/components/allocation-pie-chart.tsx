import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/src/components/text';
import { colors } from '@/src/theme/colors';
import { formatAmount } from '@/src/utils/format';

export const DEFAULT_ALLOCATION_COLORS = [
	colors.positive.DEFAULT,
	colors.accent.DEFAULT,
	colors.info.DEFAULT,
	colors.warning.DEFAULT,
	colors.negative.DEFAULT,
	colors.ink.muted,
	colors.accent.dark,
	colors.info.light,
];

export interface AllocationPieSlice {
	id: string;
	label: string;
	value: number;
	color: string;
}

interface AllocationPieChartProps {
	slices: AllocationPieSlice[];
	currency: string;
	totalLabel: string;
	onSlicePress?: (slice: AllocationPieSlice) => void;
	testID?: string;
	containerClassName?: string;
}

interface RenderSlice extends AllocationPieSlice {
	startAngle: number;
	endAngle: number;
	percent: number;
}

const SIZE = 168;
const STROKE_WIDTH = 34;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const INNER_RADIUS = RADIUS - STROKE_WIDTH;
const CENTER_TARGET_SIZE = INNER_RADIUS * 2;
const GAP_DEGREES = 1.2;

const polarToCartesian = (radius: number, angleInDegrees: number) => {
	const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

	return {
		x: CENTER + radius * Math.cos(angleInRadians),
		y: CENTER + radius * Math.sin(angleInRadians),
	};
};

const describeArc = (startAngle: number, endAngle: number) => {
	const outerStart = polarToCartesian(RADIUS, startAngle);
	const outerEnd = polarToCartesian(RADIUS, endAngle);
	const innerEnd = polarToCartesian(INNER_RADIUS, endAngle);
	const innerStart = polarToCartesian(INNER_RADIUS, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

	return [
		`M ${outerStart.x} ${outerStart.y}`,
		`A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
		`L ${innerEnd.x} ${innerEnd.y}`,
		`A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
		'Z',
	].join(' ');
};

export function AllocationPieChart({
	slices,
	currency,
	totalLabel,
	onSlicePress,
	testID = 'allocation-pie-chart',
	containerClassName = 'border-b border-paper-200 px-5 py-5',
}: AllocationPieChartProps) {
	const [activeSliceId, setActiveSliceId] = useState<string | null>(null);

	const total = useMemo(
		() => slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0),
		[slices]
	);

	const renderSlices = useMemo<RenderSlice[]>(() => {
		if (total <= 0) return [];

		let cursor = 0;
		return slices
			.filter((slice) => slice.value > 0)
			.map((slice) => {
				const sweep = (slice.value / total) * 360;
				const gap = sweep > GAP_DEGREES * 2 ? GAP_DEGREES : 0;
				const startAngle = cursor + gap / 2;
				const endAngle = cursor + sweep - gap / 2;
				cursor += sweep;

				return {
					...slice,
					startAngle,
					endAngle,
					percent: slice.value / total,
				};
			});
	}, [slices, total]);

	if (renderSlices.length === 0) return null;

	const activeSlice = renderSlices.find((slice) => slice.id === activeSliceId);
	const handleSlicePress = (slice: RenderSlice) => {
		if (activeSlice?.id !== slice.id) {
			setActiveSliceId(slice.id);
			return;
		}

		onSlicePress?.(slice);
	};

	return (
		<View
			className={containerClassName}
			testID={testID}
			accessibilityLabel={`${totalLabel} allocation chart`}
		>
			<View className="flex-row items-center gap-5">
				<View style={{ width: SIZE, height: SIZE }}>
					<Svg width={SIZE} height={SIZE}>
						<Circle
							cx={CENTER}
							cy={CENTER}
							r={RADIUS}
							stroke={colors.track.DEFAULT}
							strokeWidth={STROKE_WIDTH}
							fill="transparent"
						/>
						{renderSlices.map((slice) => {
							const isActive = slice.id === activeSlice?.id;
							return (
								<Path
									key={slice.id}
									d={describeArc(slice.startAngle, slice.endAngle)}
									fill={slice.color}
									opacity={!activeSlice || isActive ? 1 : 0.35}
									stroke={isActive ? colors.ink.DEFAULT : colors.paper[50]}
									strokeWidth={isActive ? 2 : 1}
									onPress={() => handleSlicePress(slice)}
									testID={`${testID}-slice-${slice.id}`}
								/>
							);
						})}
					</Svg>

					<Pressable
						onPress={() => setActiveSliceId(null)}
						disabled={!activeSlice}
						className="absolute items-center justify-center px-1"
						style={{
							left: CENTER - CENTER_TARGET_SIZE / 2,
							top: CENTER - CENTER_TARGET_SIZE / 2,
							width: CENTER_TARGET_SIZE,
							height: CENTER_TARGET_SIZE,
						}}
						testID={`${testID}-clear-selection`}
						accessibilityRole="button"
						accessibilityLabel="Clear chart selection"
					>
						{activeSlice && (
							<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
								{Math.round(activeSlice.percent * 100)}%
							</Text>
						)}
						<Text
							className="text-center font-sans-semibold text-lg text-ink"
							numberOfLines={1}
							adjustsFontSizeToFit
						>
							{formatAmount(activeSlice?.value ?? total, currency)}
						</Text>
					</Pressable>
				</View>

				<View className="flex-1">
					{renderSlices.slice(0, 6).map((slice) => {
						const isActive = slice.id === activeSlice?.id;
						return (
							<Pressable
								key={slice.id}
								onPress={() => handleSlicePress(slice)}
								className="flex-row items-center py-1.5"
								testID={`${testID}-legend-${slice.id}`}
								accessibilityRole="button"
								accessibilityLabel={`${slice.label}, ${formatAmount(
									slice.value,
									currency
								)}, ${Math.round(slice.percent * 100)} percent`}
							>
								<View
									className="mr-2 h-3 w-3 rounded-full"
									style={{
										backgroundColor: slice.color,
										opacity: !activeSlice || isActive ? 1 : 0.35,
									}}
								/>
								<Text
									className={`flex-1 font-sans text-sm ${
										isActive ? 'text-ink' : 'text-ink-muted'
									}`}
									numberOfLines={1}
								>
									{slice.label}
								</Text>
								<Text
									className="ml-2 font-sans text-xs text-ink-muted"
									style={{ fontVariant: ['tabular-nums'] }}
								>
									{Math.round(slice.percent * 100)}%
								</Text>
							</Pressable>
						);
					})}
					{renderSlices.length > 6 && (
						<Text className="mt-1 font-sans text-xs text-ink-muted">
							+ {renderSlices.length - 6} more
						</Text>
					)}
				</View>
			</View>
		</View>
	);
}
