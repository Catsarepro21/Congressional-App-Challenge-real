/** Applies one deadline to the full operation, including response-body reads. */
export async function controlledRequest<T>(action: (signal: AbortSignal) => Promise<T>, timeoutMs = 30000, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  try {
    const stopped = new Promise<never>((_, reject) => {
      cancel = () => {controller.abort(); reject(new Error('Request canceled.'));};
      if (parent?.aborted) {cancel(); return;}
      parent?.addEventListener('abort', cancel, {once:true});
      timer = setTimeout(() => {controller.abort(); reject(new Error('The request timed out. Please try again.'));}, timeoutMs);
    });
    if (parent?.aborted) return await stopped;
    return await Promise.race([action(controller.signal), stopped]);
  } finally {
    clearTimeout(timer); parent?.removeEventListener('abort', cancel);
  }
}
