import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getRemindersEnabled } from '@/src/utils/app-prefs';
import { CHANNEL_ID } from '@/src/services/notifications';

const TASK_NAME = 'CHECK_UNCONFIRMED';

TaskManager.defineTask(TASK_NAME, async () => {
	try {
		const enabled = await getRemindersEnabled();
		if (!enabled) {
			return BackgroundTask.BackgroundTaskResult.Success;
		}

		// Dynamically import DB to avoid circular deps at module load
		const { getDrizzleDb } = await import('@/src/db/drizzle-client');
		const { transactions } = await import('@/src/db/drizzle-schema');
		const { lte, eq, and } = await import('drizzle-orm');

		const db = await getDrizzleDb();
		const now = Date.now();
		const unconfirmed = await db
			.select({ id: transactions.id })
			.from(transactions)
			.where(and(eq(transactions.is_confirmed, false), lte(transactions.timestamp, now)));

		const count = unconfirmed.length;
		if (count > 0) {
			await Notifications.setBadgeCountAsync(count);
			await Notifications.scheduleNotificationAsync({
				content: {
					title: `${count} transaction${count > 1 ? 's' : ''} need${count > 1 ? '' : 's'} confirmation`,
					body: 'Open Kopiika to review',
					...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
				},
				trigger: null, // fire immediately
			});
			return BackgroundTask.BackgroundTaskResult.Success;
		}

		await Notifications.setBadgeCountAsync(0);
		return BackgroundTask.BackgroundTaskResult.Success;
	} catch (e) {
		console.warn('Background task failed:', e);
		return BackgroundTask.BackgroundTaskResult.Failed;
	}
});

export async function registerBackgroundTask(): Promise<void> {
	try {
		const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
		if (isRegistered) return;

		await BackgroundTask.registerTaskAsync(TASK_NAME, {
			minimumInterval: 60, // 1 hour; expo-background-task expects minutes
		});
		console.info('Background task registered:', TASK_NAME);
	} catch (e) {
		console.warn('Failed to register background task:', e);
	}
}

export async function unregisterBackgroundTask(): Promise<void> {
	try {
		const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
		if (!isRegistered) return;

		await BackgroundTask.unregisterTaskAsync(TASK_NAME);
		console.info('Background task unregistered:', TASK_NAME);
	} catch (e) {
		console.warn('Failed to unregister background task:', e);
	}
}
