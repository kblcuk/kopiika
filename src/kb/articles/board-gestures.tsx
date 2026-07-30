import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function BoardGestures() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Board gestures</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Four gestures cover everything on the Home board.
			</Text>

			<Text className="mb-2 font-sans-semibold text-base text-ink">Tap — record</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Tap a category to log a spend into it, already pointed at your Default account, or
				the first account on your board. Tap an income or an account to start from there and
				pick where the money went. Tap a savings goal to reserve funds against it.
			</Text>

			<Text className="mb-2 font-sans-semibold text-base text-ink">
				Long-press — look back
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Hold a bubble for about a second and let go without moving it to open History
				filtered to that entity. If you move your finger, it becomes an ordinary drag
				instead.
			</Text>

			<Text className="mb-2 font-sans-semibold text-base text-ink">Drag — connect</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Hold a bubble and drag it onto another to move money between the two. Dragging
				against the usual direction starts a refund instead.
			</Text>

			<Text className="mb-2 font-sans-semibold text-base text-ink">Pencil — rearrange</Text>
			<Text className="font-sans text-base text-ink">
				The pencil beside a section title switches that section to edit mode: taps open
				entity settings and drags reorder bubbles within the section.
			</Text>
		</View>
	);
}
