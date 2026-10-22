/**
 * @file src/services/CloudPermissionGuard.ts
 * @description Strict user-consent gateway for all outbound cloud API calls.
 *
 * Enforces the user's rule: if the app ever attempts to use an external cloud API,
 * it MUST request interactive user authorization EVERY SINGLE TIME before any byte
 * leaves the device. If denied, the app strictly remains 100% local.
 */

import { create } from 'zustand';

export interface CloudRequestDetails {
  id: string;
  purpose: string;
  endpoint: string;
  dataPayloadSummary: string;
  sensitiveFields?: string[];
}

interface PendingCloudRequest {
  details: CloudRequestDetails;
  resolve: (allowed: boolean) => void;
}

interface CloudPermissionState {
  currentRequest: CloudRequestDetails | null;
  setCurrentRequest: (req: CloudRequestDetails | null) => void;
}

export const useCloudPermissionStore = create<CloudPermissionState>(set => ({
  currentRequest: null,
  setCurrentRequest: req => set({ currentRequest: req }),
}));

// Resolve lazily to avoid importing the health store during service initialization.
function cloudBlocked(): boolean {
  try {
    const state = require('../store/useSafeScaleStore').useSafeScaleStore.getState();
    return state.isTestMode || state.isDeletingData;
  } catch { return true; }
}

let activeResolver: ((allowed: boolean) => void) | null = null;

export const CloudPermissionGuard = {
  /**
   * Request user authorization before making an outbound cloud network call.
   * Prompts the user interactively. Never caches approval — asks every single time.
   *
   * @param details Explanation of what is being transmitted, where, and why.
   * @returns Promise<boolean> true if explicitly allowed by user, false if denied.
   */
  requestPermission: async (
    details: Omit<CloudRequestDetails, 'id'>,
    signal?: AbortSignal,
  ): Promise<boolean> => {
    // If a request is already active, reject new concurrent requests for safety
    if (cloudBlocked() || signal?.aborted || activeResolver) {
      return false;
    }

    const fullDetails: CloudRequestDetails = {
      ...details,
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };

    return new Promise<boolean>(resolve => {
      const cancel = () => CloudPermissionGuard.denyCurrentRequest(fullDetails.id);
      activeResolver = allowed => {signal?.removeEventListener('abort', cancel); resolve(allowed);};
      signal?.addEventListener('abort', cancel, {once:true});
      useCloudPermissionStore.getState().setCurrentRequest(fullDetails);
    });
  },

  /**
   * Called by the UI modal when the user taps "Allow Once".
   */
  approveCurrentRequest: (id: string) => {
    if (useCloudPermissionStore.getState().currentRequest?.id !== id) return;
    if (activeResolver) {
      activeResolver(!cloudBlocked());
      activeResolver = null;
    }
    useCloudPermissionStore.getState().setCurrentRequest(null);
  },

  /**
   * Called by the UI modal when the user taps "Deny & Keep On-Device".
   */
  denyCurrentRequest: (id: string) => {
    if (useCloudPermissionStore.getState().currentRequest?.id !== id) return;
    if (activeResolver) {
      activeResolver(false);
      activeResolver = null;
    }
    useCloudPermissionStore.getState().setCurrentRequest(null);
  },

  /**
   * Helper that checks permission and either executes the cloud function or
   * gracefully falls back to a local offline routine.
   */
  executeWithPermission: async <T>(
    details: Omit<CloudRequestDetails, 'id'>,
    cloudAction: () => Promise<T>,
    localFallbackAction?: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    const granted = await CloudPermissionGuard.requestPermission(details, signal);
    if (signal?.aborted) throw new Error('Request canceled.');
    if (granted && !cloudBlocked()) {
      return await cloudAction();
    }

    if (localFallbackAction) {
      return await localFallbackAction();
    }

    throw new Error(
      `Cloud AI request blocked or declined. No data was uploaded by this request.`,
    );
  },
};
