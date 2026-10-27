import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior for active application state
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let notificationGeneration = 0;
export const NotificationService = {
  cancelAllReminders: async (): Promise<void> => {
    notificationGeneration++;
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  },
  /**
   * Request notification permissions from the user.
   * Returns true if granted.
   */
  requestPermissions: async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#227C54',
        });
      }

      return finalStatus === 'granted';
    } catch (e) {
      console.warn('Error requesting notification permissions:', e);
      return false;
    }
  },

  /**
   * Schedule a daily recurring notification for a medication.
   * Time format expected: "HH:MM" (e.g. "08:30" or "21:00")
   */
  scheduleMedicationReminder: async (
    medId: string,
    name: string,
    dosage: string,
    time: string
  ): Promise<string | null> => {
    const generation = notificationGeneration;
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission || generation !== notificationGeneration) return null;

      const [hourStr, minuteStr] = time.split(':');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (!/^\d{2}:\d{2}$/.test(time) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

      // Cancel any pre-existing notification for this medication ID to prevent duplicates
      await NotificationService.cancelMedicationReminder(medId);

      const trigger: Notifications.NotificationTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      };

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Healthfolio reminder',
          body: 'Open Healthfolio to review your scheduled routine.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { medId },
        },
        trigger,
      });

      if (generation !== notificationGeneration) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        return null;
      }
      return identifier;
    } catch (e) {
      console.warn('Error scheduling notification:', e);
      return null;
    }
  },

  /**
   * Cancels a scheduled medication notification.
   */
  cancelMedicationReminder: async (medId: string): Promise<void> => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const match = scheduled.find(n => n.content.data?.medId === medId);
      if (match) {
        await Notifications.cancelScheduledNotificationAsync(match.identifier);
      }
    } catch (e) {
      console.warn('Error cancelling notification:', e);
    }
  },

  /**
   * Test/schedule a quick notification that fires in 5 seconds.
   */
  scheduleQuickTest: async (): Promise<string | null> => {
    const generation = notificationGeneration;
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission || generation !== notificationGeneration) return null;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Healthfolio Reminder',
          body: 'This is a test notification from your Healthfolio Tracker!',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });
      if (generation !== notificationGeneration) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        return null;
      }
      return identifier;
    } catch (e) {
      console.warn('Error scheduling test notification:', e);
      return null;
    }
  },

  /**
   * Schedule a recurring notification for hydration reminder at custom intervals.
   */
  scheduleHydrationReminder: async (intervalHours: number): Promise<string | null> => {
    const generation = notificationGeneration;
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission || generation !== notificationGeneration) return null;

      // Cancel previous hydration reminders first
      await NotificationService.cancelHydrationReminder();

      const seconds = intervalHours * 3600;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hydration Reminder 💧',
          body: `It's time to drink some water and stay on track with your daily goal!`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          data: { type: 'hydration' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          repeats: true,
        },
      });

      if (generation !== notificationGeneration) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        return null;
      }
      return identifier;
    } catch (e) {
      console.warn('Error scheduling hydration reminder:', e);
      return null;
    }
  },

  /**
   * Cancel scheduled hydration reminder.
   */
  cancelHydrationReminder: async (): Promise<void> => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const match = scheduled.find(n => n.content.data?.type === 'hydration');
      if (match) {
        await Notifications.cancelScheduledNotificationAsync(match.identifier);
      }
    } catch (e) {
      console.warn('Error cancelling hydration reminder:', e);
    }
  },

  /**
   * Schedule/Trigger a low stock alert immediately.
   */
  scheduleLowStockAlert: async (name: string, remaining: number): Promise<string | null> => {
    const generation = notificationGeneration;
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission || generation !== notificationGeneration) return null;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Healthfolio reminder',
          body: 'Open Healthfolio to review an item in your routine.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'refill' },
        },
        trigger: null, // null trigger immediately fires
      });

      if (generation !== notificationGeneration) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        return null;
      }
      return identifier;
    } catch (e) {
      console.warn('Error scheduling low stock alert:', e);
      return null;
    }
  },

  /**
   * Schedule a one-time reminder for an upcoming vaccine milestone.
   */
  scheduleVaccineReminder: async (
    milestoneId: string,
    name: string,
    dueDate: string
  ): Promise<string | null> => {
    const generation = notificationGeneration;
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission || generation !== notificationGeneration) return null;

      await NotificationService.cancelVaccineReminder(milestoneId);

      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
      if (!match) return null;
      const [, year, month, day] = match.map(Number);
      const targetDate = new Date(year, month - 1, day, 9, 0, 0, 0);
      if (targetDate.getFullYear() !== year || targetDate.getMonth() !== month - 1 || targetDate.getDate() !== day || targetDate <= new Date()) return null;

      const trigger: any = targetDate;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Healthfolio reminder',
          body: 'Open Healthfolio to review an upcoming date.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          data: { milestoneId },
        },
        trigger,
      });

      if (generation !== notificationGeneration) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        return null;
      }
      return identifier;
    } catch (e) {
      console.warn('Error scheduling vaccine reminder:', e);
      return null;
    }
  },

  /**
   * Cancel vaccine milestone reminder notification.
   */
  cancelVaccineReminder: async (milestoneId: string): Promise<void> => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const match = scheduled.find(n => n.content.data?.milestoneId === milestoneId);
      if (match) {
        await Notifications.cancelScheduledNotificationAsync(match.identifier);
      }
    } catch (e) {
      console.warn('Error cancelling vaccine reminder:', e);
    }
  }
};
