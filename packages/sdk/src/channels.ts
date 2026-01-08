/**
 * MoneyMQ Channel API - Listener, Processor, and Actor patterns
 *
 * Provides pub/sub event communication over SSE with optional publish capability.
 *
 * @example Listener (frontend - subscribe only)
 * ```typescript
 * const listener = moneymq.payment.listener('tx-123');
 * listener.on('payment:settled', (event) => console.log(event));
 * listener.connect();
 * ```
 *
 * @example Processor (backend - transaction spawner)
 * ```typescript
 * const processor = moneymq.payment.processor();
 * processor.on('transaction', (tx) => {
 *   const actor = tx.actor();
 *   actor.on('payment:settled', async (event) => {
 *     await actor.send('order:completed', { ... });
 *   });
 * });
 * processor.connect();
 * ```
 */

// ============================================================================
// EventSource Type Declarations (browser/Node.js compatibility)
// ============================================================================

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
// Constants
// ============================================================================

/**
 * Known event types for payment channels
 */
export const EventTypes = {
  /** Payment has been verified */
  PAYMENT_VERIFIED: 'payment:verified',
  /** Payment has been settled */
  PAYMENT_SETTLED: 'payment:settled',
  /** Payment verification failed */
  PAYMENT_VERIFICATION_FAILED: 'payment:verification_failed',
  /** Payment settlement failed */
  PAYMENT_SETTLEMENT_FAILED: 'payment:settlement_failed',
  /** Payment failed (generic) */
  PAYMENT_FAILED: 'payment:failed',
  /** New transaction received (for processors) */
  TRANSACTION: 'transaction',
  /** Processor attaching data to transaction */
  TRANSACTION_ATTACH: 'transaction:attach',
  /** Transaction completed with receipt */
  TRANSACTION_COMPLETED: 'transaction:completed',
} as const;

/**
 * Payment defaults
 */
export const Defaults = {
  /** Default JWT expiration time in hours */
  JWT_EXPIRATION_HOURS: 24,
  /** Default currency code */
  CURRENCY: 'USDC',
  /** Default network (lowercase) */
  NETWORK: 'solana',
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Product feature definition
 */
export interface ProductFeature {
  /** Feature display name */
  name?: string;
  /** Feature description */
  description?: string;
  /** Feature value (can be bool, number, string, etc.) */
  value?: unknown;
}

/**
 * Basket item representing a product in a transaction
 */
export interface BasketItem {
  /** Product ID from catalog */
  productId: string;
  /** Experiment variant ID (e.g., "surfnet-lite#a") */
  experimentId?: string;
  /** Product features (capabilities and limits purchased) */
  features?: Record<string, ProductFeature> | unknown;
  /** Quantity of items */
  quantity?: number;
}

/**
 * Payment details from x402 payment
 */
export interface PaymentDetails {
  /** Payer address/wallet */
  payer: string;
  /** Transaction ID/signature */
  transactionId: string;
  /** Payment amount as string */
  amount: string;
  /** Currency code (e.g., "USDC") */
  currency: string;
  /** Network name (e.g., "solana") */
  network: string;
}

/**
 * Channel event envelope
 */
export interface ChannelEvent<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type (e.g., 'payment:settled', 'order:completed') */
  type: string;
  /** Event payload */
  data: T;
  /** ISO 8601 timestamp */
  time: string;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Event handler callback
 */
export type ChannelEventHandler<T = unknown> = (event: ChannelEvent<T>) => void | Promise<void>;

/**
 * Connection event handler
 */
export type ConnectionHandler = () => void;

/**
 * Error handler
 */
export type ChannelErrorHandler = (error: ChannelError) => void;

/**
 * Reader options (subscribe only)
 */
export interface ReaderOptions {
  /** Stream ID for server-side cursor tracking (stateful mode) */
  streamId?: string;
  /** Replay last N events on connect */
  replay?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Max reconnect attempts (0 = infinite) */
  maxReconnectAttempts?: number;
}

/**
 * Actor options (subscribe + publish)
 */
export interface ActorOptions extends ReaderOptions {
  /** Secret for authorization (uses client secret if not provided) */
  secret?: string;
}

/**
 * Receiver options (transaction listener)
 */
export interface ReceiverOptions {
  /** Secret for authorization (uses client secret if not provided) */
  secret?: string;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Max reconnect attempts (0 = infinite) */
  maxReconnectAttempts?: number;
}

/**
 * Transaction data from receiver
 */
export interface Transaction {
  /** Transaction ID */
  id: string;
  /** Channel ID for this transaction */
  channelId: string;
  /** Basket items (products being purchased with features) */
  basket: BasketItem[];
  /** Payment details from x402 */
  payment?: PaymentDetails;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Channel error with code
 */
export class ChannelError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ChannelError';
    this.code = code;
  }
}

// ============================================================================
// Base Channel Class
// ============================================================================

/**
 * Base class for channel connections (shared by Reader and Actor)
 */
abstract class BaseChannel {
  protected endpoint: string;
  protected channelId: string;
  protected options: Required<Omit<ReaderOptions, 'streamId'>> & { streamId?: string };
  protected eventSource: EventSource | null = null;
  protected state: ConnectionState = 'disconnected';
  protected reconnectAttempts = 0;

  // Event handlers by type - stored with captured console.log for proper log routing
  protected handlers: Map<
    string,
    Set<{ handler: ChannelEventHandler; consoleLog: typeof console.log }>
  > = new Map();
  protected connectionHandlers: Set<ConnectionHandler> = new Set();
  protected disconnectionHandlers: Set<ConnectionHandler> = new Set();
  protected errorHandlers: Set<ChannelErrorHandler> = new Set();

  constructor(endpoint: string, channelId: string, options: ReaderOptions = {}) {
    this.endpoint = endpoint;
    this.channelId = channelId;
    this.options = {
      streamId: options.streamId,
      replay: options.replay ?? 0,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
    };
  }

  /**
   * Current connection state
   */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Whether currently connected
   */
  get isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Subscribe to events of a specific type
   */
  on(eventType: 'connected', handler: ConnectionHandler): () => void;
  on(eventType: 'disconnected', handler: ConnectionHandler): () => void;
  on(eventType: 'error', handler: ChannelErrorHandler): () => void;
  on<T = unknown>(eventType: string, handler: ChannelEventHandler<T>): () => void;
  on(
    eventType: string,
    handler: ChannelEventHandler | ConnectionHandler | ChannelErrorHandler,
  ): () => void {
    if (eventType === 'connected') {
      this.connectionHandlers.add(handler as ConnectionHandler);
      return () => this.connectionHandlers.delete(handler as ConnectionHandler);
    }
    if (eventType === 'disconnected') {
      this.disconnectionHandlers.add(handler as ConnectionHandler);
      return () => this.disconnectionHandlers.delete(handler as ConnectionHandler);
    }
    if (eventType === 'error') {
      this.errorHandlers.add(handler as ChannelErrorHandler);
      return () => this.errorHandlers.delete(handler as ChannelErrorHandler);
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    // Capture console.log at registration time so callbacks route to correct UI
    const entry = { handler: handler as ChannelEventHandler, consoleLog: console.log };
    this.handlers.get(eventType)!.add(entry);
    return () => this.handlers.get(eventType)?.delete(entry);
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: 'connected', handler: ConnectionHandler): void;
  off(eventType: 'disconnected', handler: ConnectionHandler): void;
  off(eventType: 'error', handler: ChannelErrorHandler): void;
  off<T = unknown>(eventType: string, handler: ChannelEventHandler<T>): void;
  off(
    eventType: string,
    handler: ChannelEventHandler | ConnectionHandler | ChannelErrorHandler,
  ): void {
    if (eventType === 'connected') {
      this.connectionHandlers.delete(handler as ConnectionHandler);
      return;
    }
    if (eventType === 'disconnected') {
      this.disconnectionHandlers.delete(handler as ConnectionHandler);
      return;
    }
    if (eventType === 'error') {
      this.errorHandlers.delete(handler as ChannelErrorHandler);
      return;
    }
    // Find and delete by handler reference
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const entry of handlers) {
        if (entry.handler === handler) {
          handlers.delete(entry);
          break;
        }
      }
    }
  }

  /**
   * Connect to the channel
   */
  connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.setState('connecting');
    const url = this.buildUrl();
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.connectionHandlers.forEach((h) => h());
    };

    // Listen for all message events
    this.eventSource.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;

      if (this.options.autoReconnect && this.shouldReconnect()) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
        this.disconnectionHandlers.forEach((h) => h());
        this.emitError(new ChannelError('Connection lost', 'CONNECTION_LOST'));
      }
    };
  }

  /**
   * Disconnect from the channel
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setState('disconnected');
    this.reconnectAttempts = 0;
    this.disconnectionHandlers.forEach((h) => h());
  }

  protected abstract buildUrl(): string;

  protected handleMessage(event: MessageEvent): void {
    try {
      const channelEvent = JSON.parse(event.data as string) as ChannelEvent;
      this.emitEvent(channelEvent);
    } catch (e) {
      this.emitError(new ChannelError(`Failed to parse event: ${e}`, 'PARSE_ERROR'));
    }
  }

  protected setState(state: ConnectionState): void {
    this.state = state;
  }

  protected shouldReconnect(): boolean {
    if (this.options.maxReconnectAttempts === 0) return true;
    return this.reconnectAttempts < this.options.maxReconnectAttempts;
  }

  protected scheduleReconnect(): void {
    this.setState('reconnecting');
    this.reconnectAttempts++;

    setTimeout(() => {
      if (this.state === 'reconnecting') {
        this.connect();
      }
    }, this.options.reconnectDelay);
  }

  protected emitEvent(event: ChannelEvent): void {
    // Emit to specific type handlers
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      typeHandlers.forEach(({ handler, consoleLog }) => {
        // Temporarily restore the console.log that was active when handler was registered
        const prevLog = console.log;
        console.log = consoleLog;
        try {
          handler(event);
        } catch (e) {
          console.error(`Error in event handler for ${event.type}:`, e);
        } finally {
          console.log = prevLog;
        }
      });
    }

    // Emit to wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(({ handler, consoleLog }) => {
        // Temporarily restore the console.log that was active when handler was registered
        const prevLog = console.log;
        console.log = consoleLog;
        try {
          handler(event);
        } catch (e) {
          console.error('Error in wildcard event handler:', e);
        } finally {
          console.log = prevLog;
        }
      });
    }
  }

  protected emitError(error: ChannelError): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (e) {
        console.error('Error in error handler:', e);
      }
    });
  }
}

// ============================================================================
// EventReader Class
// ============================================================================

/**
 * Event reader - subscribe only channel connection
 *
 * Use for frontend applications that only need to receive events.
 *
 * @example
 * ```typescript
 * const reader = new EventReader('http://localhost:8488', 'order-123');
 *
 * reader.on('payment:settled', (event) => {
 *   console.log('Payment settled:', event.data);
 * });
 *
 * reader.on('order:completed', (event) => {
 *   console.log('Order completed:', event.data.trackingNumber);
 * });
 *
 * reader.connect();
 * ```
 */
export class EventReader extends BaseChannel {
  constructor(endpoint: string, channelId: string, options: ReaderOptions = {}) {
    super(endpoint, channelId, options);
  }

  protected buildUrl(): string {
    const params = new URLSearchParams();

    // Stream ID for stateful cursor tracking
    if (this.options.streamId) {
      params.set('stream_id', this.options.streamId);
    }

    if (this.options.replay > 0) {
      params.set('replay', this.options.replay.toString());
    }

    const queryString = params.toString();
    const base = `${this.endpoint}/payment/v1/channels/${encodeURIComponent(this.channelId)}`;
    return queryString ? `${base}?${queryString}` : base;
  }
}

// ============================================================================
// EventActor Class
// ============================================================================

/**
 * Event actor - subscribe + publish channel connection
 *
 * Use for backend applications that need to receive events and publish responses.
 *
 * @example
 * ```typescript
 * const actor = new EventActor('http://localhost:8488', 'order-123', {
 *   secret: 'your-secret'
 * });
 *
 * actor.on('payment:settled', async (event) => {
 *   // Process the payment
 *   const order = await processOrder(event.data);
 *
 *   // Publish completion event to all channel subscribers
 *   await actor.send('order:completed', {
 *     orderId: order.id,
 *     trackingNumber: order.tracking
 *   });
 * });
 *
 * actor.connect();
 * ```
 */
export class EventActor extends BaseChannel {
  private secret?: string;

  constructor(endpoint: string, channelId: string, options: ActorOptions) {
    super(endpoint, channelId, options);
    this.secret = options.secret;
  }

  protected buildUrl(): string {
    const params = new URLSearchParams();

    // Stream ID for stateful cursor tracking
    if (this.options.streamId) {
      params.set('stream_id', this.options.streamId);
    }

    if (this.options.replay > 0) {
      params.set('replay', this.options.replay.toString());
    }

    // Include auth token in query for SSE (can't use headers with EventSource)
    if (this.secret) {
      params.set('token', this.secret);
    }

    const queryString = params.toString();
    const base = `${this.endpoint}/payment/v1/channels/${encodeURIComponent(this.channelId)}`;
    return queryString ? `${base}?${queryString}` : base;
  }

  /**
   * Publish an event to the channel
   *
   * All connected readers and actors on this channel will receive the event.
   *
   * @param type - Event type (e.g., 'order:completed')
   * @param data - Event payload
   * @returns The created event
   */
  async send<T = unknown>(type: string, data: T): Promise<ChannelEvent<T>> {
    const url = `${this.endpoint}/payment/v1/channels/${encodeURIComponent(this.channelId)}/attachments`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify({ type, data }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new ChannelError(
        errorData.message || `Failed to send event: ${response.status}`,
        response.status === 401 ? 'UNAUTHORIZED' : 'SEND_FAILED',
      );
    }

    return response.json() as Promise<ChannelEvent<T>>;
  }
}

// ============================================================================
// EventReceiver Class
// ============================================================================

/**
 * Transaction wrapper for receiver callbacks
 */
class TransactionContext implements Transaction {
  id: string;
  channelId: string;
  basket: BasketItem[];
  payment?: PaymentDetails;
  metadata?: Record<string, unknown>;

  private endpoint: string;
  private secret: string;

  constructor(data: Transaction, endpoint: string, secret: string) {
    this.id = data.id;
    this.channelId = data.channelId;
    this.basket = data.basket ?? [];
    this.payment = data.payment;
    this.metadata = data.metadata;
    this.endpoint = endpoint;
    this.secret = secret;
  }

  /**
   * Get the payment amount as string (from payment details)
   */
  get amount(): string {
    return this.payment?.amount ?? '0';
  }

  /**
   * Get the currency (from payment details)
   */
  get currency(): string {
    return this.payment?.currency ?? Defaults.CURRENCY;
  }

  /**
   * Get the first product ID from basket (convenience method)
   */
  get productId(): string | undefined {
    return this.basket[0]?.productId;
  }

  /**
   * Get the payer address (from payment details)
   */
  get payer(): string | undefined {
    return this.payment?.payer;
  }

  /**
   * Get the network (from payment details)
   */
  get network(): string | undefined {
    return this.payment?.network;
  }

  /**
   * Get features for the first product in basket (convenience method)
   */
  get features(): Record<string, ProductFeature> | unknown | undefined {
    return this.basket[0]?.features;
  }

  /**
   * Create an actor scoped to this transaction's channel
   *
   * The actor is automatically connected.
   */
  actor(options?: Omit<ActorOptions, 'secret'>): EventActor {
    const actor = new EventActor(this.endpoint, this.channelId, {
      ...options,
      secret: this.secret,
    });
    actor.connect();
    return actor;
  }
}

/**
 * Transaction handler callback
 */
export type TransactionHandler = (tx: TransactionContext) => void | Promise<void>;

/**
 * Event receiver - listens for new transactions and spawns actors
 *
 * Use for backend applications that need to handle multiple concurrent transactions.
 *
 * @example
 * ```typescript
 * const receiver = new EventReceiver('http://localhost:8488', {
 *   secret: 'your-secret'
 * });
 *
 * receiver.on('transaction', (tx) => {
 *   console.log('New transaction:', tx.id);
 *
 *   const actor = tx.actor();
 *
 *   actor.on('payment:settled', async (event) => {
 *     await processPayment(event.data);
 *     await actor.send('order:completed', { orderId: tx.id });
 *   });
 * });
 *
 * receiver.connect();
 * ```
 */
export class EventReceiver {
  private endpoint: string;
  private secret?: string;
  private options: {
    autoReconnect: boolean;
    reconnectDelay: number;
    maxReconnectAttempts: number;
  };
  private eventSource: EventSource | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;

  private transactionHandlers: Set<{ handler: TransactionHandler; consoleLog: typeof console.log }> =
    new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ChannelErrorHandler> = new Set();

  constructor(endpoint: string, options: ReceiverOptions = {}) {
    this.endpoint = endpoint;
    this.secret = options.secret;
    this.options = {
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
    };
  }

  /**
   * Current connection state
   */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Whether currently connected
   */
  get isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Subscribe to events
   */
  on(eventType: 'transaction', handler: TransactionHandler): () => void;
  on(eventType: 'connected', handler: ConnectionHandler): () => void;
  on(eventType: 'disconnected', handler: ConnectionHandler): () => void;
  on(eventType: 'error', handler: ChannelErrorHandler): () => void;
  on(
    eventType: string,
    handler: TransactionHandler | ConnectionHandler | ChannelErrorHandler,
  ): () => void {
    switch (eventType) {
      case 'transaction': {
        // Capture console.log at registration time so callbacks route to correct UI
        const entry = { handler: handler as TransactionHandler, consoleLog: console.log };
        this.transactionHandlers.add(entry);
        return () => this.transactionHandlers.delete(entry);
      }
      case 'connected':
        this.connectionHandlers.add(handler as ConnectionHandler);
        return () => this.connectionHandlers.delete(handler as ConnectionHandler);
      case 'disconnected':
        this.disconnectionHandlers.add(handler as ConnectionHandler);
        return () => this.disconnectionHandlers.delete(handler as ConnectionHandler);
      case 'error':
        this.errorHandlers.add(handler as ChannelErrorHandler);
        return () => this.errorHandlers.delete(handler as ChannelErrorHandler);
      default:
        return () => {};
    }
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: 'transaction', handler: TransactionHandler): void;
  off(eventType: 'connected', handler: ConnectionHandler): void;
  off(eventType: 'disconnected', handler: ConnectionHandler): void;
  off(eventType: 'error', handler: ChannelErrorHandler): void;
  off(
    eventType: string,
    handler: TransactionHandler | ConnectionHandler | ChannelErrorHandler,
  ): void {
    switch (eventType) {
      case 'transaction': {
        // Find and delete by handler reference
        for (const entry of this.transactionHandlers) {
          if (entry.handler === handler) {
            this.transactionHandlers.delete(entry);
            break;
          }
        }
        break;
      }
      case 'connected':
        this.connectionHandlers.delete(handler as ConnectionHandler);
        break;
      case 'disconnected':
        this.disconnectionHandlers.delete(handler as ConnectionHandler);
        break;
      case 'error':
        this.errorHandlers.delete(handler as ChannelErrorHandler);
        break;
    }
  }

  /**
   * Connect to the transaction stream
   */
  connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.setState('connecting');

    const params = new URLSearchParams();
    if (this.secret) {
      params.set('token', this.secret);
    }
    const url = `${this.endpoint}/payment/v1/channels/transactions?${params.toString()}`;

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.connectionHandlers.forEach((h) => h());
    };

    this.eventSource.addEventListener('transaction', (event: MessageEvent) => {
      try {
        const txData = JSON.parse(event.data as string) as Transaction;
        const tx = new TransactionContext(txData, this.endpoint, this.secret ?? '');
        this.transactionHandlers.forEach(({ handler, consoleLog }) => {
          // Temporarily restore the console.log that was active when handler was registered
          const prevLog = console.log;
          console.log = consoleLog;
          try {
            handler(tx);
          } catch (e) {
            console.error('Error in transaction handler:', e);
          } finally {
            console.log = prevLog;
          }
        });
      } catch (e) {
        this.emitError(new ChannelError(`Failed to parse transaction: ${e}`, 'PARSE_ERROR'));
      }
    });

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;

      if (this.options.autoReconnect && this.shouldReconnect()) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
        this.disconnectionHandlers.forEach((h) => h());
        this.emitError(new ChannelError('Connection lost', 'CONNECTION_LOST'));
      }
    };
  }

  /**
   * Disconnect from the transaction stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setState('disconnected');
    this.reconnectAttempts = 0;
    this.disconnectionHandlers.forEach((h) => h());
  }

  private setState(state: ConnectionState): void {
    this.state = state;
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

  private emitError(error: ChannelError): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (e) {
        console.error('Error in error handler:', e);
      }
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an event reader
 */
export function createEventReader(
  endpoint: string,
  channelId: string,
  options?: ReaderOptions,
): EventReader {
  return new EventReader(endpoint, channelId, options);
}

/**
 * Create an event actor
 */
export function createEventActor(
  endpoint: string,
  channelId: string,
  options: ActorOptions,
): EventActor {
  return new EventActor(endpoint, channelId, options);
}

/**
 * Create an event receiver
 */
export function createEventReceiver(endpoint: string, options: ReceiverOptions): EventReceiver {
  return new EventReceiver(endpoint, options);
}
