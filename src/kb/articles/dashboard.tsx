import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function Dashboard() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				{'Dashboard: understand the numbers'}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Four kinds of bubble'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Income shows money received this month. Categories show spending this month. Accounts show available money from all recorded movements. Savings show money set aside, across all months. Nothing is erased when the month changes.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Available, reserved, and total'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Receive 1,000, spend 30, and reserve 100: your account shows 870 available and 970 total. The other 100 is reserved for your savings goal. Reserving is an allocation in Kopiika; it does not transfer money at your bank or count as an expense.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Balance'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'The header adds the available balances of ordinary accounts with Include in total balance enabled. Reserved money is already deducted. Investment accounts are excluded. A negative balance stays visible.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Expenses'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'The header adds category spending for the current month. Account transfers and savings reservations do not count as expenses.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Planned'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'This header figure means the amount left in category plans, not the original planned amount. A plan of 200 with spending of 50 contributes 150. An overspent category contributes zero here; its overspending still appears on its bubble.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Recording and editing'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'The arrow shows or hides income. Tap the pencil to edit the board: tapping opens bubble settings and dragging changes order within a section. Tap the pencil again to record money. In recording mode your Settings choice decides whether a tap records or opens History; long-press does the other action. Dragging connects a source and destination in either gesture preference.'
				}
			</Text>
		</View>
	);
}
