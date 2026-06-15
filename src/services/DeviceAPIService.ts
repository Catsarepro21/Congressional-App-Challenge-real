/**
 * @file DeviceAPIService.ts
 * @description Simulated API adapters for Fitbit, Strava, Polar, and Withings.
 * 
 * Provides mock OAuth handshake timelines and returns realistic biometric metrics.
 * Integrated with the Zustand store to merge wearable sensor records.
 */

export interface DeviceSyncResult {
  steps?: number;
  activeCalories?: number;
  heartRate?: number;
  restingHeartRate?: number;
  sleepMinutes?: number;
  sleepConsistency?: number;
  systolicBP?: number;
  diastolicBP?: number;
  weightKg?: number;
}

export const DeviceAPIService = {
  /**
   * Simulates an OAuth 2.0 security authorization handshake for a direct wearable API.
   * Runs an asynchronous timer to simulate network request round-trips.
   */
  authorizeDevice: async (
    device: 'fitbit' | 'strava' | 'polar' | 'withings',
    onProgress: (step: string) => void
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      const steps = [
        `Connecting to ${device.toUpperCase()} security servers...`,
        'Requesting authorization credentials (OAuth 2.0)...',
        'Validating scope grants (profile, activity, heart rate)...',
        'Generating authorization code verifier...',
        'Connection established and token cached successfully!'
      ];

      let currentStep = 0;
      onProgress(steps[0]);

      const interval = setInterval(() => {
        currentStep++;
        if (currentStep < steps.length) {
          onProgress(steps[currentStep]);
        } else {
          clearInterval(interval);
          resolve(true);
        }
      }, 700);
    });
  },

  /**
   * Retrieves simulated telemetry updates from the target wearable API.
   * Returns a customized set of metrics based on the device's main capabilities.
   */
  fetchDeviceData: async (
    device: 'fitbit' | 'strava' | 'polar' | 'withings'
  ): Promise<DeviceSyncResult> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const now = Date.now();
        
        switch (device) {
          case 'fitbit':
            // Fitbit is an all-rounder: steps, calories, heart rate, sleep
            resolve({
              steps: Math.floor(9000 + Math.random() * 3000),
              activeCalories: Math.floor(400 + Math.random() * 150),
              heartRate: Math.floor(66 + Math.random() * 10),
              restingHeartRate: Math.floor(58 + Math.random() * 6),
              sleepMinutes: Math.floor(450 + Math.random() * 60),
              sleepConsistency: Math.floor(85 + Math.random() * 10),
            });
            break;
            
          case 'strava':
            // Strava focuses on active workout calories and high heart rate
            resolve({
              activeCalories: Math.floor(550 + Math.random() * 200),
              heartRate: Math.floor(130 + Math.random() * 20), // Workout heart rate average
            });
            break;
            
          case 'polar':
            // Polar excels at heart rate analytics and detailed sleep data
            resolve({
              restingHeartRate: Math.floor(54 + Math.random() * 5),
              heartRate: Math.floor(64 + Math.random() * 8),
              sleepMinutes: Math.floor(470 + Math.random() * 50),
              sleepConsistency: Math.floor(92 + Math.random() * 6),
            });
            break;
            
          case 'withings':
            // Withings focuses on weight and clinical vitals (blood pressure)
            resolve({
              weightKg: Math.floor(68 + Math.random() * 4),
              systolicBP: Math.floor(118 + Math.random() * 8),
              diastolicBP: Math.floor(78 + Math.random() * 6),
            });
            break;
            
          default:
            resolve({});
        }
      }, 1200);
    });
  }
};
