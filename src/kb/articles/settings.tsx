import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function SettingsHelp() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				{'Settings: make the app work for you'}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Currency'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Kopiika uses one app currency. Changing it relabels existing amounts; it does not apply an exchange rate or convert their value. Choose the currency you use to track your money.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Bubble gestures'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Tap a bubble and Long-press a bubble are linked choices: one records a transaction and the other opens History. Changing either swaps the other. Edit mode always opens bubble settings on tap. Practice always uses tap to record and preserves your own preference.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Transaction Reminders'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Enable local notifications for scheduled, unconfirmed movements. Notifications need device permission. Turning reminders off cancels them; your transaction history remains.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Your data'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Export to CSV creates a backup to share or save. Import from CSV restores data after the app explains the replacement. Reset All Data deletes personal records after confirmation. Bank-statement import is a separate account action and lets you review individual rows.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Learn and replay'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Help & how it works opens searchable explanations. Show tutorial again opens a fresh board with example money; exiting returns here. It never adds examples to your personal history. Version shows the installed app version; Privacy Policy opens the policy in your browser.'
				}
			</Text>
		</View>
	);
}
