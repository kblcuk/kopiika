import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

export const OPERATORS = ['(', ')', '+', '\u2212', '\u00D7', '\u00F7'] as const;
export type Operator = (typeof OPERATORS)[number];

interface OperatorToolbarProps {
	onOperator: (op: Operator) => void;
	onEquals: () => void;
}

export function OperatorToolbar({ onOperator, onEquals }: OperatorToolbarProps) {
	const handleOp = (op: Operator) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onOperator(op);
	};

	const handleEquals = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		onEquals();
	};

	return (
		<View className="flex-row gap-1.5 border-t border-paper-300 bg-paper-50 px-3 py-1.5">
			{OPERATORS.map((op) => {
				const isBracket = op === '(' || op === ')';
				return (
					<Pressable
						key={op}
						onPress={() => handleOp(op)}
						className={`flex-1 items-center justify-center rounded-lg py-2 ${
							isBracket ? 'bg-paper-200' : 'bg-accent/10'
						}`}
						style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
						testID={`op-${op}`}
					>
						<Text
							className={`font-sans-semibold text-base ${
								isBracket ? 'text-ink-muted' : 'text-accent'
							}`}
						>
							{op}
						</Text>
					</Pressable>
				);
			})}
			<Pressable
				onPress={handleEquals}
				className="flex-1 items-center justify-center rounded-lg bg-accent py-2"
				style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
				testID="op-equals"
			>
				<Text className="font-sans-bold text-base text-on-color">=</Text>
			</Pressable>
		</View>
	);
}
