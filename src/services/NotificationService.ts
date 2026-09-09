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

export const NotificationService = {
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
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

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
          title: `Medication Reminder: ${name}`,
          body: `It is time to take your ${dosage}.`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { medId },
        },
        trigger,
      });

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
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'SafeScale Health Reminder',
          body: 'This is a test notification from your SafeScale Health Tracker!',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });
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
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

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
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Medication Low Stock Alert',
          body: `You only have ${remaining} doses of ${name} remaining. Please refill soon!`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'refill', medName: name },
        },
        trigger: null, // null trigger immediately fires
      });

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
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

      await NotificationService.cancelVaccineReminder(milestoneId);

      const targetDate = new Date(dueDate);
      if (isNaN(targetDate.getTime()) || targetDate <= new Date()) {
        return null;
      }

      targetDate.setHours(9, 0, 0, 0);

      const trigger: any = targetDate;

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Upcoming Vaccination Milestone 💉`,
          body: `You are due for: ${name}. Contact your physician to schedule.`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          data: { milestoneId },
        },
        trigger,
      });

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
