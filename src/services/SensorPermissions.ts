type Permission = {granted: boolean; canAskAgain: boolean};

// Shared across effect restarts: only one sensor permission dialog can be active.
let pending: Promise<unknown> = Promise.resolve();
export function requestSensorPermission<T extends Permission>(
  read: () => Promise<T>,
  request: () => Promise<T>,
  cancelled: () => boolean,
): Promise<T | null> {
  const operation = pending.then(async () => {
    if (cancelled()) return null;
    const current = await read();
    if (cancelled()) return null;
    if (current.granted || !current.canAskAgain) return current;
    return request();
  });
  // A failed OS call must not block later permission checks.
  pending = operation.catch(() => undefined);
  return operation;
}
