/** Local-only compatibility boundary for legacy cloud callers. Approval cannot enable uploads. */
import {create} from 'zustand';
export interface CloudRequestDetails {
  id: string;
  purpose: string;
  endpoint: string;
  dataPayloadSummary: string;
  sensitiveFields?: string[];
}
export const useCloudPermissionStore = create<{
  currentRequest: CloudRequestDetails | null;
  setCurrentRequest: (request: CloudRequestDetails | null) => void;
}>(set => ({currentRequest:null, setCurrentRequest:currentRequest=>set({currentRequest})}));
export const CloudPermissionGuard = {
  requestPermission: async (_details: Omit<CloudRequestDetails,'id'>, _signal?: AbortSignal): Promise<boolean> => false,
  approveCurrentRequest: (_id: string) => useCloudPermissionStore.setState({currentRequest:null}),
  denyCurrentRequest: (_id: string) => useCloudPermissionStore.setState({currentRequest:null}),
  executeWithPermission: async <T>(
    _details: Omit<CloudRequestDetails,'id'>,
    _cloudAction: () => Promise<T>,
    localFallbackAction?: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    // Give cancellation queued by the caller a chance to settle before local work starts.
    await Promise.resolve();
    if (signal?.aborted) throw new Error('Request canceled.');
    if (localFallbackAction) return localFallbackAction();
    throw new Error('Cloud request blocked. External services are disabled; no data was uploaded.');
  },
};
