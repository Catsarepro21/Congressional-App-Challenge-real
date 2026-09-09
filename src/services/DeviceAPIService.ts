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

type Device = 'fitbit' | 'strava' | 'polar' | 'withings';
const unavailable = (device: Device): never => {
  throw new Error(`Direct ${device} integration is not implemented. Sync through Apple Health or Android Health Connect where your device supports it, or log your measurements manually.`);
};
export const DeviceAPIService = {
  authorizeDevice: async (device: Device, _onProgress: (step: string) => void): Promise<boolean> => unavailable(device),
  fetchDeviceData: async (device: Device): Promise<DeviceSyncResult> => unavailable(device),
};
