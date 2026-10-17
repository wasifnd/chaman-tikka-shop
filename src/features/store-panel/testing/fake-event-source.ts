type Listener = (event: MessageEvent<string>) => void;

/** A stand-in for the browser's EventSource that tests can drive by hand. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static get last(): FakeEventSource {
    const instance = FakeEventSource.instances.at(-1);
    if (!instance) throw new Error('No EventSource was created');
    return instance;
  }
  static reset() {
    FakeEventSource.instances = [];
  }

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** 0 connecting, 1 open, 2 closed (the browser will not retry). */
  readyState = 0;
  closed = false;
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  /** A dropped connection the browser will retry by itself. */
  dropAndRetry() {
    this.readyState = 0;
    this.onerror?.();
  }

  /** The server refused the connection (for example 401): the browser gives up for good. */
  refuse() {
    this.readyState = 2;
    this.onerror?.();
  }

  emit(type: string, data: string, lastEventId: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data, lastEventId }));
    }
  }

  send(id: number, payload: Record<string, unknown>, type = 'order.status_changed') {
    this.emit(type, JSON.stringify({ type, ...payload }), String(id));
  }
}
