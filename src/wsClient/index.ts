import { EventType } from "../types/eventTypes";

interface retryConfig {
  max: number;
  delay: number;
  backoff?: boolean;
}

type Handler<T> = (data: T, ws: WS) => void | Promise<void>;

class WS {
  private conn?: WebSocket;
  private readonly url: string;
  private retry: retryConfig;
  private retryCount: number = 0;
  private readonly reconnectDelay: number; // Initial delay for reconnection in seconds
  private reconnectTimeout?: number;
  private closed: boolean = false;
  private handlers: Map<EventType, Handler<ArrayBuffer | string>> = new Map();
  private stateChangeCallback?: (connected: boolean) => void;

  constructor(url: string, retryConfig?: Partial<retryConfig>) {
    this.url = url;
    this.retry = {
      max: 5,
      delay: 1,
      backoff: true,
      ...retryConfig,
    };

    this.reconnectDelay = this.retry.delay;

    this.connect();
  }

  // Register a handler for a specific event type.
  on<T extends ArrayBuffer | string>(
    eventType: EventType,
    handler: Handler<T>,
  ) {
    this.handlers.set(eventType, handler as Handler<ArrayBuffer | string>);
  }

  off(eventType: EventType) {
    this.handlers.delete(eventType);
  }

  // Register a callback for connection state changes
  onConnectionStateChange(callback: (connected: boolean) => void) {
    this.stateChangeCallback = callback;
  }

  private connect() {
    this.conn = new WebSocket(this.url);
    this.conn.onopen = (ev: Event) => {
      console.log(`Websocket connected.`);
      console.debug(ev);
      this.retryCount = 0;
      this.retry.delay = this.reconnectDelay; // Reset delay after successful connection
      if (this.stateChangeCallback) {
        this.stateChangeCallback(true);
      }
    };
    this.conn.onclose = (ev: Event) => {
      console.log(`Websocket disconnected.`);
      console.debug(ev);
      this.conn = undefined;
      if (this.stateChangeCallback) {
        this.stateChangeCallback(false);
      }
      this.reconnect();
    };
    this.conn.onmessage = async (ev: MessageEvent) => {
      console.debug(`Received message: \n`, ev.data);
      if (ev.data instanceof Blob) {
        const arrayBuffer = await ev.data.arrayBuffer();
        console.debug(`Received binary message: \n`, arrayBuffer);
        const view = new DataView(arrayBuffer);
        const eventType = view.getUint8(0) as EventType;
        const handler = this.handlers.get(eventType);
        if (handler) {
          if (typeof handler === "function") {
            await handler(arrayBuffer, this);
          } else {
            console.warn(`Handler for event type ${eventType} is not a function`);
          }
        } else {
          console.warn(`No handler registered for event type ${eventType}`);
        }
      } else if (typeof ev.data === "string") {
        let message
        try {
          message = JSON.parse(ev.data);
        } catch (e) {
          console.error(`Failed to parse JSON message: ${(e as Error).message}`);
          return;
        }
        console.debug(`Received text message: \n`, message);
      }
    };
  }
  close() {
    this.closed = true;
    if (this.conn) {
      if (this.conn.readyState === WebSocket.CONNECTING) {
        console.log("Closing WebSocket while still connecting...");
        // Ussually this means the ws was closed by the `Strict Mode` of React 18, so we don't need to reconnect in this case.
      }
      this.conn.close();
      this.conn = undefined;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    // Notify state change when manually closed
    if (this.stateChangeCallback) {
      this.stateChangeCallback(false);
    }
  }
  private reconnect() {
    if (this.closed) {
      console.debug(`Websocket is closed. Not reconnecting.`);
      return;
    }
    if (this.retryCount >= this.retry.max) {
      console.warn(`Max retry attempts reached. Giving up.`);
      return;
    }
    this.retryCount += 1;
    console.log(
      `Attempting to reconnect after ${this.retry.delay}s... (attempt ${this.retryCount})`,
    );
    if (this.retry.backoff && this.retryCount > 4) {
      this.retry.delay *= 2;
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.retry.delay * 1000);
  }

  async send(data: ArrayBuffer | string) {
    if (this.conn && this.conn.readyState === WebSocket.OPEN) {
      this.conn.send(data);
    } else {
      console.warn(`Websocket is not connected. Cannot send message.`);
    }
  }

  async sendJson(message: any) {
    const jsonString = JSON.stringify(message);
    await this.send(jsonString);
  }

  // Check if the WebSocket is connected
  isConnected(): boolean {
    return !!this.conn && this.conn.readyState === WebSocket.OPEN;
  }
}

export default { WS };
export { WS };
