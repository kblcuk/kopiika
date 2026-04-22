import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export { getNotifiableTransactions } from './notification-logic';

export const CHANNEL_ID = 'transaction-reminders';

// ── Native wrappers ─────────────────────────────────────────────────────

export async function setupNotificationChannel(): Promise<void> {
	if (Platform.OS === 'android') {
		await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
			name: 'Transaction Reminders',
			importance: Notifications.AndroidImportance.DEFAULT,
			sound: 'default',
		});
	}
}

export async function requestPermission(): Promise<boolean> {
	const { status: existing } = await Notifications.getPermissionsAsync();
	if (existing === 'granted') return true;

	const { status } = await Notifications.requestPermissionsAsync();
	return status === 'granted';
}

export async function scheduleTransactionNotification(params: {
	transactionId: string;
	fromName: string;
	toName: string;
	amount: string;
	timestamp: number;
}): Promise<string> {
	return Notifications.scheduleNotificationAsync({
		content: {
			title: 'Transaction needs confirmation',
			body: `${params.fromName} \u2192 ${params.toName}: ${params.amount}`,
			data: { transactionId: params.transactionId },
			...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.DATE,
			date: new Date(params.timestamp),
		},
	});
}

export async function cancelNotification(notificationId: string): Promise<void> {
	await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function cancelAllNotifications(): Promise<void> {
	await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function updateBadgeCount(count: number): Promise<void> {
	await Notifications.setBadgeCountAsync(count);
}
