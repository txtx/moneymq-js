import { PAYMENT_API_PATH } from './config';

/**
 * Server-Sent Events (SSE) helpers for MoneyMQ real-time events
 *
 * Supports two modes:
 * - **Stateless**: Client tracks cursor, replay from memory on reconnect
 * - **Stateful**: Server tracks cursor in DB, guaranteed delivery on reconnect
 *
 * @example Stateless stream (client-side cursor)
 * ```typescript
 * import { MoneyMQ } from '@moneymq/sdk';
 *
 * const moneymq = new MoneyMQ({ endpoint: 'http://localhost:8488' });
 *
 * // Create a stateless event stream with replay
 * const stream = moneymq.events.stream({ last: 10 });
 *
 * stream.on('payment', (event) => {
 *   console.log('Payment event:', event.type, event.data);
 *   // Store cursor for reconnection
 *   localStorage.setItem('cursor', event.id);
 * });
 *
 * stream.connect();
 * ```
 *
 * @example Stateful stream (server-side cursor persistence)
 * ```typescript
 * import { MoneyMQ } from '@moneymq/sdk';
 *
 * const moneymq = new MoneyMQ({ endpoint: 'http://localhost:8488' });
 *
 * // Create a stateful stream - server tracks your position
 * // Use a unique, deterministic ID for your consumer
 * const stream = moneymq.events.stream({
 *   streamId: 'checkout-widget-user-123',
 * });
 *
 * stream.on('payment', (event) => {
 *   // Server automatically tracks cursor - no need to store locally
 *   console.log('Payment event:', event.type, event.data);
 * });
 *
 * stream.connect();
 *
 * // On reconnect, server replays missed events automatically
 * ```
 */

// Type declarations for EventSource (browser API)
// These allow the SDK to work in both browser and Node.js (with polyfills)
declare class EventSource {
  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSED: 2;
  readonly readyState: number;
  readonly url: string;
  onopen: ((this: EventSource, ev: Event) => unknown) | null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null;
  constructor(url: string | URL, eventSourceInitDict?: EventSourceInit);
  close(): void;
  addEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface EventSourceInit {
  withCredentials?: boolean;
}

interface Event {
  readonly type: string;
}

interface MessageEvent {
  readonly data: unknown;
  readonly lastEventId: string;
  readonly origin: string;
}

interface AddEventListenerOptions {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
  signal?: AbortSignal;
}

interface EventListenerOptions {
  capture?: boolean;
}

// ============================================================================
// Types
// ============================================================================

/**
 * CloudEvent v1.0 specification envelope
 */
export interface CloudEventEnvelope<T = unknown> {
  /** CloudEvents specification version */
  specversion: string;
  /** Unique event identifier (UUID) */
  id: string;
  /** Event type (e.g., 'mq.money.payment.verification.succeeded') */
  type: string;
  /** Event source URI */
  source: string;
  /** Timestamp in ISO 8601 format */
  time: string;
  /** Content type of the data field */
  datacontenttype: string;
  /** Event payload */
  data: T;
}

/**
 * Payment flow type - indicates how the payment was initiated
 */
export type PaymentFlow =
  | { type: 'x402' }
  | { type: 'checkout'; intent_id: string };

/**
 * Payment verification succeeded event data
 */
export interface PaymentVerificationSucceededData {
  /** Wallet address of the payer */
  payer: string;
  /** Amount in smallest unit (e.g., lamports for SOL, micro-units for USDC) */
  amount: string;
  /** Network the payment was verified on */
  network: string;
  /** Product ID if available */
  product_id: string | null;
  /** Payment flow type (x402 or checkout) */
  payment_flow: PaymentFlow;
}

/**
 * Payment verification failed event data
 */
export interface PaymentVerificationFailedData {
  /** Wallet address of the payer if known */
  payer: string | null;
  /** Amount that was attempted */
  amount: string;
  /** Network the verification was attempted on */
  network: string;
  /** Reason for the failure */
  reason: string;
  /** Product ID if available */
  product_id: string | null;
  /** Payment flow type (x402 or checkout) */
  payment_flow: PaymentFlow;
}

/**
 * Payment settlement succeeded event data
 */
export interface PaymentSettlementSucceededData {
  /** Wallet address of the payer */
  payer: string;
  /** Amount in smallest unit (e.g., lamports for SOL, micro-units for USDC) */
  amount: string;
  /** Network the transaction occurred on */
  network: string;
  /** Transaction signature/hash if available */
  transaction_signature: string | null;
  /** Product ID if available */
  product_id: string | null;
  /** Payment flow type (x402 or checkout) */
  payment_flow: PaymentFlow;
  /** Transaction/channel ID for subscribing to processor events */
  transaction_id?: string;
}

/**
 * Payment settlement failed event data
 */
export interface PaymentSettlementFailedData {
  /** Wallet address of the payer if known */
  payer: string | null;
  /** Amount that was attempted */
  amount: string;
  /** Network the settlement was attempted on */
  network: string;
  /** Reason for the failure */
  reason: string;
  /** Product ID if available */
  product_id: string | null;
  /** Payment flow type (x402 or checkout) */
  payment_flow: PaymentFlow;
}

/**
 * Transaction completed event data
 * This is emitted when a transaction is fully complete (settled and all attachments received)
 */
export interface TransactionCompletedData {
  /** Transaction ID (payment_hash) */
  transaction_id: string;
  /** JWT receipt token containing payment claims */
  receipt: string;
  /** Wallet address of the payer */
  payer: string;
  /** Payment amount */
  amount: string;
  /** Currency code */
  currency: string;
  /** Network name */
  network: string;
  /** Transaction signature on-chain */
  transaction_signature: string | null;
  /** Product ID if applicable */
  product_id: string | null;
}

/**
 * All MoneyMQ event types
 */
export type MoneyMQEventType =
  | 'mq.money.payment.verification.succeeded'
  | 'mq.money.payment.verification.failed'
  | 'mq.money.payment.settlement.succeeded'
  | 'mq.money.payment.settlement.failed'
  | 'mq.money.transaction.completed';

/**
 * Event type to data type mapping
 */
export interface MoneyMQEventMap {
  'mq.money.payment.verification.succeeded': PaymentVerificationSucceededData;
  'mq.money.payment.verification.failed': PaymentVerificationFailedData;
  'mq.money.payment.settlement.succeeded': PaymentSettlementSucceededData;
  'mq.money.payment.settlement.failed': PaymentSettlementFailedData;
  'mq.money.transaction.completed': TransactionCompletedData;
}

/**
 * Payment verification event (succeeded or failed)
 */
export type PaymentVerificationEvent =
  | CloudEventEnvelope<PaymentVerificationSucceededData>
  | CloudEventEnvelope<PaymentVerificationFailedData>;

/**
 * Payment settlement event (succeeded or failed)
 */
export type PaymentSettlementEvent =
  | CloudEventEnvelope<PaymentSettlementSucceededData>
  | CloudEventEnvelope<PaymentSettlementFailedData>;

/**
 * Transaction completed event
 */
export type TransactionCompletedEvent = CloudEventEnvelope<TransactionCompletedData>;

/**
 * Any payment event
 */
export type PaymentEvent = PaymentVerificationEvent | PaymentSettlementEvent | TransactionCompletedEvent;

// ============================================================================
// Event Stream Options
// ============================================================================

/**
 * Options for creating an event stream connection
 */
export interface EventStreamOptions {
  /**
   * Replay the last N events before switching to live
   * @example { last: 10 } - Replay last 10 events
   */
  last?: number;

  /**
   * Resume from a specific event ID (exclusive)
   * Events after this ID will be replayed, then live events
   * @example { cursor: 'abc-123-def' }
   */
  cursor?: string;

  /**
   * Stateful stream ID for server-side cursor persistence
   *
   * When provided, the server tracks the last consumed event for this stream.
   * On reconnection, missed events are automatically replayed from where you left off.
   *
   * Use a deterministic ID unique to your consumer (e.g., 'checkout-widget-123').
   *
   * @example { streamId: 'my-checkout-widget' }
   */
  streamId?: string;

  /**
   * Automatically reconnect on connection loss
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Delay between reconnection attempts in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Maximum number of reconnection attempts (0 = infinite)
   * @default 0
   */
  maxReconnectAttempts?: number;
}

/**
 * Event stream connection state
 */
export type EventStreamState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Event handler callback type
 */
export type EventHandler<T = PaymentEvent> = (event: T) => void;

/**
 * Error handler callback type
 */
export type ErrorHandler = (error: Error) => void;

/**
 * State change handler callback type
 */
export type StateHandler = (state: EventStreamState) => void;

// ============================================================================
// Event Stream Class
// ============================================================================

/**
 * MoneyMQ Event Stream client for receiving real-time purchase events
 *
 * @example
 * ```typescript
 * const stream = new EventStream('http://localhost:8488', { last: 5 });
 *
 * stream.on('payment', (event) => {
 *   console.log('Payment event:', event.type);
 *   // Store cursor for reconnection
 *   localStorage.setItem('cursor', event.id);
 * });
 *
 * stream.on('error', (error) => {
 *   console.error('Stream error:', error);
 * });
 *
 * stream.on('stateChange', (state) => {
 *   console.log('Connection state:', state);
 * });
 *
 * stream.connect();
 *
 * // Later: disconnect
 * stream.disconnect();
 * ```
 */
export class EventStream {
  private endpoint: string;
  private options: Required<EventStreamOptions>;
  private eventSource: EventSource | null = null;
  private state: EventStreamState = 'disconnected';
  private reconnectAttempts = 0;
  private lastEventId: string | null = null;

  private paymentHandlers: Set<EventHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private stateHandlers: Set<StateHandler> = new Set();

  constructor(endpoint: string, options: EventStreamOptions = {}) {
    this.endpoint = endpoint;
    console.log('[MoneyMQ SDK] EventStream constructor called with options:', JSON.stringify(options));
    this.options = {
      last: options.last ?? 0,
      cursor: options.cursor ?? '',
      streamId: options.streamId ?? '',
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
    };
    console.log('[MoneyMQ SDK] Resolved options:', JSON.stringify(this.options));

    // Initialize cursor from options (only for stateless streams)
    // For stateful streams, the server tracks the cursor
    if (this.options.cursor && !this.options.streamId) {
      this.lastEventId = this.options.cursor;
    }
  }

  /**
   * Whether this is a stateful stream (server tracks cursor)
   */
  get isStateful(): boolean {
    return this.options.streamId !== '';
  }

  /**
   * The stream ID for stateful streams
   */
  get streamId(): string | null {
    return this.options.streamId || null;
  }

  /**
   * Current connection state
   */
  get connectionState(): EventStreamState {
    return this.state;
  }

  /**
   * Current cursor (last received event ID)
   */
  get cursor(): string | null {
    return this.lastEventId;
  }

  /**
   * Whether the stream is currently connected
   */
  get isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Register an event handler
   *
   * @param event - Event type: 'payment', 'error', or 'stateChange'
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  on(event: 'payment', handler: EventHandler): () => void;
  on(event: 'error', handler: ErrorHandler): () => void;
  on(event: 'stateChange', handler: StateHandler): () => void;
  on(
    event: 'payment' | 'error' | 'stateChange',
    handler: EventHandler | ErrorHandler | StateHandler,
  ): () => void {
    switch (event) {
      case 'payment':
        this.paymentHandlers.add(handler as EventHandler);
        return () => this.paymentHandlers.delete(handler as EventHandler);
      case 'error':
        this.errorHandlers.add(handler as ErrorHandler);
        return () => this.errorHandlers.delete(handler as ErrorHandler);
      case 'stateChange':
        this.stateHandlers.add(handler as StateHandler);
        return () => this.stateHandlers.delete(handler as StateHandler);
    }
  }

  /**
   * Remove an event handler
   */
  off(event: 'payment', handler: EventHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(event: 'stateChange', handler: StateHandler): void;
  off(
    event: 'payment' | 'error' | 'stateChange',
    handler: EventHandler | ErrorHandler | StateHandler,
  ): void {
    switch (event) {
      case 'payment':
        this.paymentHandlers.delete(handler as EventHandler);
        break;
      case 'error':
        this.errorHandlers.delete(handler as ErrorHandler);
        break;
      case 'stateChange':
        this.stateHandlers.delete(handler as StateHandler);
        break;
    }
  }

  /**
   * Connect to the event stream
   */
  connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.setState('connecting');

    const url = this.buildUrl();
    console.log('[MoneyMQ SDK] Connecting to SSE:', url, '| streamId:', this.options.streamId || '(none)');
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
    };

    this.eventSource.addEventListener('payment', (event: MessageEvent) => {
      try {
        const cloudEvent = JSON.parse(event.data as string) as PaymentEvent;
        this.lastEventId = cloudEvent.id;
        this.emitPayment(cloudEvent);
      } catch (e) {
        this.emitError(new Error(`Failed to parse event: ${e}`));
      }
    });

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;

      if (this.options.autoReconnect && this.shouldReconnect()) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
        this.emitError(new Error('Connection lost'));
      }
    };
  }

  /**
   * Disconnect from the event stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setState('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Reconnect with a new cursor
   * Useful for resuming from a stored position
   */
  reconnectFrom(cursor: string): void {
    this.lastEventId = cursor;
    this.disconnect();
    this.connect();
  }

  private buildUrl(): string {
    const params = new URLSearchParams();

    // For stateful streams, always include stream_id
    // The server tracks the cursor, so we don't need to send it on reconnection
    if (this.options.streamId) {
      params.set('stream_id', this.options.streamId);
      // On first connection, we can request last N events
      if (this.options.last > 0) {
        params.set('last', this.options.last.toString());
      }
    } else {
      // Stateless mode: use lastEventId for cursor if we have one (for reconnection)
      if (this.lastEventId) {
        params.set('cursor', this.lastEventId);
      } else if (this.options.last > 0) {
        params.set('last', this.options.last.toString());
      }
    }

    const queryString = params.toString();
    return queryString
      ? `${this.endpoint}${PAYMENT_API_PATH}/events?${queryString}`
      : `${this.endpoint}${PAYMENT_API_PATH}/events`;
  }

  private setState(state: EventStreamState): void {
    if (this.state !== state) {
      this.state = state;
      this.stateHandlers.forEach((handler) => handler(state));
    }
  }

  private shouldReconnect(): boolean {
    if (this.options.maxReconnectAttempts === 0) return true;
    return this.reconnectAttempts < this.options.maxReconnectAttempts;
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    this.reconnectAttempts++;

    setTimeout(() => {
      if (this.state === 'reconnecting') {
        this.connect();
      }
    }, this.options.reconnectDelay);
  }

  private emitPayment(event: PaymentEvent): void {
    this.paymentHandlers.forEach((handler) => handler(event));
  }

  private emitError(error: Error): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an event stream connection
 *
 * @param endpoint - MoneyMQ API endpoint
 * @param options - Stream options (cursor, replay count, etc.)
 * @returns EventStream instance
 *
 * @example
 * ```typescript
 * // Live events only
 * const stream = createEventStream('http://localhost:8488');
 *
 * // Replay last 10 events
 * const stream = createEventStream('http://localhost:8488', { last: 10 });
 *
 * // Resume from cursor
 * const cursor = localStorage.getItem('lastEventId');
 * const stream = createEventStream('http://localhost:8488', { cursor });
 * ```
 */
export function createEventStream(endpoint: string, options?: EventStreamOptions): EventStream {
  return new EventStream(endpoint, options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an event is a payment verification succeeded event
 */
export function isPaymentVerificationSucceeded(
  event: PaymentEvent,
): event is CloudEventEnvelope<PaymentVerificationSucceededData> {
  return event.type === 'mq.money.payment.verification.succeeded';
}

/**
 * Check if an event is a payment verification failed event
 */
export function isPaymentVerificationFailed(
  event: PaymentEvent,
): event is CloudEventEnvelope<PaymentVerificationFailedData> {
  return event.type === 'mq.money.payment.verification.failed';
}

/**
 * Check if an event is a payment settlement succeeded event
 */
export function isPaymentSettlementSucceeded(
  event: PaymentEvent,
): event is CloudEventEnvelope<PaymentSettlementSucceededData> {
  return event.type === 'mq.money.payment.settlement.succeeded';
}

/**
 * Check if an event is a payment settlement failed event
 */
export function isPaymentSettlementFailed(
  event: PaymentEvent,
): event is CloudEventEnvelope<PaymentSettlementFailedData> {
  return event.type === 'mq.money.payment.settlement.failed';
}

/**
 * Check if an event is a transaction completed event
 */
export function isTransactionCompleted(
  event: PaymentEvent,
): event is CloudEventEnvelope<TransactionCompletedData> {
  return event.type === 'mq.money.transaction.completed';
}

/**
 * Parse a raw SSE data string into a CloudEvent
 *
 * @param data - Raw event data string from SSE
 * @returns Parsed CloudEvent or null if parsing fails
 */
export function parseCloudEvent(data: string): PaymentEvent | null {
  try {
    return JSON.parse(data) as PaymentEvent;
  } catch {
    return null;
  }
}

/**
 * Build an event stream URL with query parameters
 *
 * @param endpoint - MoneyMQ API endpoint
 * @param options - Stream options
 * @returns Full URL string
 *
 * @example
 * ```typescript
 * const url = buildEventStreamUrl('http://localhost:8488', { last: 10 });
 * // Returns: 'http://localhost:8488/events?last=10'
 *
 * const url = buildEventStreamUrl('http://localhost:8488', { cursor: 'abc' });
 * // Returns: 'http://localhost:8488/events?cursor=abc'
 *
 * // Stateful stream (server tracks cursor):
 * const url = buildEventStreamUrl('http://localhost:8488', { streamId: 'my-stream' });
 * // Returns: 'http://localhost:8488/events?stream_id=my-stream'
 * ```
 */
export function buildEventStreamUrl(
  endpoint: string,
  options?: Pick<EventStreamOptions, 'last' | 'cursor' | 'streamId'>,
): string {
  const params = new URLSearchParams();

  // For stateful streams, include stream_id
  if (options?.streamId) {
    params.set('stream_id', options.streamId);
    if (options.last && options.last > 0) {
      params.set('last', options.last.toString());
    }
  } else {
    // Stateless mode
    if (options?.cursor) {
      params.set('cursor', options.cursor);
    } else if (options?.last && options.last > 0) {
      params.set('last', options.last.toString());
    }
  }

  const queryString = params.toString();
  return queryString
    ? `${endpoint}${PAYMENT_API_PATH}/events?${queryString}`
    : `${endpoint}${PAYMENT_API_PATH}/events`;
}
