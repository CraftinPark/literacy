/**
 * Type that can be disposed.
 */
export interface IDisposable {
  dispose(): void;
}

export const noopDisposable: IDisposable = { dispose: () => undefined };

/**
 * Function that subscribes the method to receive data.
 */
export type Event<T> = (listener: (data: T) => void) => IDisposable;

/** Creates an Event that fires when the signal is aborted. */
export const onAbort = (signal: AbortSignal): { event: Event<unknown> } & IDisposable => {
  const evt = new OneShotEvent<unknown>();
  if (signal.aborted) {
    evt.emit(signal.reason);
    return { event: evt.addListener, dispose: () => {} };
  }

  const dispose = () => (signal as any).removeEventListener('abort', l);

  // @types/node is currently missing the event types on AbortSignal
  const l = () => {
    evt.emit(signal.reason);
    dispose();
  };

  (signal as any).addEventListener('abort', l);

  return { event: evt.addListener, dispose };
};

/**
 * Base event emitter. Calls listeners when data is emitted.
 */
export class EventEmitter<T> {
  protected listeners?: Array<(data: T) => void> | ((data: T) => void);

  /**
   * Event<T> function.
   */
  public readonly addListener: Event<T> = listener => this.addListenerInner(listener);

  /**
   * Gets the number of event listeners.
   */
  public get size() {
    if (!this.listeners) {
      return 0;
    } else if (typeof this.listeners === 'function') {
      return 1;
    } else {
      return this.listeners.length;
    }
  }

  /**
   * Emits event data.
   */
  public emit(value: T) {
    if (!this.listeners) {
      // no-op
    } else if (typeof this.listeners === 'function') {
      this.listeners(value);
    } else {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }

  protected addListenerInner(listener: (data: T) => void): IDisposable {
    if (!this.listeners) {
      this.listeners = listener;
    } else if (typeof this.listeners === 'function') {
      this.listeners = [this.listeners, listener];
    } else {
      this.listeners.push(listener);
    }

    return { dispose: () => this.removeListener(listener) };
  }

  private removeListener(listener: (data: T) => void) {
    if (!this.listeners) {
      return;
    }

    if (typeof this.listeners === 'function') {
      if (this.listeners === listener) {
        this.listeners = undefined;
      }
      return;
    }

    const index = this.listeners.indexOf(listener);
    if (index === -1) {
      return;
    }

    if (this.listeners.length === 2) {
      this.listeners = index === 0 ? this.listeners[1] : this.listeners[0];
    } else {
      this.listeners = this.listeners.slice(0, index).concat(this.listeners.slice(index + 1));
    }
  }
}

/**
 * An event emitter that fires a value once and removes all
 * listeners automatically after doing so.
 */
class OneShotEvent<T> extends EventEmitter<T> {
  /**
   * Last emitted value, wrapped in an object so that we can correctly detect
   * emission of 'undefined' values.
   */
  private lastValue?: { value: T };

  /**
   * @inheritdoc
   */
  public readonly addListener: Event<T> = listener => {
    if (this.lastValue) {
      listener(this.lastValue.value);
      return noopDisposable;
    } else {
      return this.addListenerInner(listener);
    }
  };

  /**
   * @inheritdoc
   */
  public emit(value: T) {
    this.lastValue = { value };
    super.emit(value);
    this.listeners = undefined;
  }
}
