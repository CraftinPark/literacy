import { IDisposable, onAbort } from './Event.js';

export const neverAbortedSignal: AbortSignal = new AbortController().signal;

const cancelledSrc = new AbortController();
cancelledSrc.abort();
export const abortedSignal: AbortSignal = cancelledSrc.signal;

const noop: () => void = () => {};

/**
 * Creates a new AbortController that is aborted when the parent signal aborts.
 * @private
 */
export const deriveAbortController = (
  signal?: AbortSignal,
): { ctrl: AbortController } & IDisposable => {
  const ctrl = new AbortController();
  let dispose: () => void = noop;
  if (!signal) {
    return { ctrl, dispose };
  }

  if (signal.aborted) {
    ctrl.abort(signal.reason);
  } else {
    const abortEvt = onAbort(signal);
    abortEvt.event((reason: any) => ctrl.abort(reason));
    dispose = abortEvt.dispose;
  }

  return { ctrl, dispose };
};
