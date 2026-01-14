import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EventReader,
  PaymentHook,
  PaymentStream,
  ChannelError,
  createEventReader,
  createPaymentHook,
  createPaymentStream,
  TransactionWithHook,
} from './channels';

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private listeners: Map<string, Set<(event: MessageEvent) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      this.onopen?.({} as Event);
    }, 0);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // Test helper: emit an event
  _emit(type: string, data: unknown) {
    const event = {
      data: JSON.stringify(data),
      lastEventId: '',
      origin: '',
    } as MessageEvent;

    // Call specific listeners
    this.listeners.get(type)?.forEach((listener) => listener(event));

    // Also call onmessage for 'message' type
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
  }

  // Test helper: simulate error
  _error() {
    this.onerror?.({} as Event);
  }
}

// Mock fetch
const mockFetch = vi.fn();

// Install mocks
beforeEach(() => {
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EventReader', () => {
  const endpoint = 'http://localhost:8488';
  const channelId = 'test-channel';

  it('should create a reader with correct URL', () => {
    const reader = new EventReader(endpoint, channelId);
    reader.connect();

    const es = (reader as unknown as { eventSource: MockEventSource }).eventSource;
    expect(es.url).toBe(`${endpoint}/payment/v1/channels/${channelId}`);
  });

  it('should include replay param when specified', () => {
    const reader = new EventReader(endpoint, channelId, { replay: 10 });
    reader.connect();

    const es = (reader as unknown as { eventSource: MockEventSource }).eventSource;
    expect(es.url).toBe(`${endpoint}/payment/v1/channels/${channelId}?replay=10`);
  });

  it('should handle connected state', async () => {
    const reader = new EventReader(endpoint, channelId);
    const connectedHandler = vi.fn();

    reader.on('connected', connectedHandler);
    reader.connect();

    // Wait for async connection
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(connectedHandler).toHaveBeenCalled();
    expect(reader.isConnected).toBe(true);
    expect(reader.connectionState).toBe('connected');
  });

  it('should receive and dispatch events', async () => {
    const reader = new EventReader(endpoint, channelId);
    const handler = vi.fn();

    reader.on('payment:settled', handler);
    reader.connect();

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Emit event
    const es = (reader as unknown as { eventSource: MockEventSource }).eventSource;
    es._emit('message', {
      id: 'evt_123',
      type: 'payment:settled',
      data: { amount: 1000 },
      time: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt_123',
        type: 'payment:settled',
        data: { amount: 1000 },
      }),
    );
  });

  it('should unsubscribe handlers', async () => {
    const reader = new EventReader(endpoint, channelId);
    const handler = vi.fn();

    const unsubscribe = reader.on('payment:settled', handler);
    reader.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Unsubscribe
    unsubscribe();

    // Emit event
    const es = (reader as unknown as { eventSource: MockEventSource }).eventSource;
    es._emit('message', {
      id: 'evt_123',
      type: 'payment:settled',
      data: {},
      time: new Date().toISOString(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle wildcard listeners', async () => {
    const reader = new EventReader(endpoint, channelId);
    const wildcardHandler = vi.fn();
    const specificHandler = vi.fn();

    reader.on('*', wildcardHandler);
    reader.on('payment:settled', specificHandler);
    reader.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const es = (reader as unknown as { eventSource: MockEventSource }).eventSource;
    es._emit('message', {
      id: 'evt_123',
      type: 'payment:settled',
      data: {},
      time: new Date().toISOString(),
    });

    expect(wildcardHandler).toHaveBeenCalled();
    expect(specificHandler).toHaveBeenCalled();
  });

  it('should disconnect properly', async () => {
    const reader = new EventReader(endpoint, channelId);
    const disconnectedHandler = vi.fn();

    reader.on('disconnected', disconnectedHandler);
    reader.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    reader.disconnect();

    expect(reader.isConnected).toBe(false);
    expect(reader.connectionState).toBe('disconnected');
    expect(disconnectedHandler).toHaveBeenCalled();
  });
});

describe('PaymentHook', () => {
  const endpoint = 'http://localhost:8488';
  const channelId = 'test-channel';
  const secret = 'test-secret';

  it('should include auth token in URL', () => {
    const hook = new PaymentHook(endpoint, channelId, { secret });
    hook.connect();

    const es = (hook as unknown as { eventSource: MockEventSource }).eventSource;
    expect(es.url).toContain('token=test-secret');
  });

  it('should attach data via HTTP POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'evt_456',
          type: 'transaction:attach',
          data: { orderId: '123' },
          time: new Date().toISOString(),
        }),
    });

    const hook = new PaymentHook(endpoint, channelId, { secret, actorId: 'actor_123' });

    const result = await hook.attach('fulfillment', { orderId: '123' });

    expect(mockFetch).toHaveBeenCalledWith(
      `${endpoint}/payment/v1/channels/${channelId}/attachments`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          actor_id: 'actor_123',
          key: 'fulfillment',
          data: { orderId: '123' },
        }),
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'evt_456',
        type: 'transaction:attach',
        data: { orderId: '123' },
      }),
    );
  });

  it('should throw ChannelError on attach failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    const hook = new PaymentHook(endpoint, channelId, { secret, actorId: 'actor_123' });

    await expect(hook.attach('test', {})).rejects.toThrow(ChannelError);

    // Reset and test again for the code check
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    await expect(hook.attach('test', {})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should handle non-401 errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server error' }),
    });

    const hook = new PaymentHook(endpoint, channelId, { secret, actorId: 'actor_123' });

    await expect(hook.attach('test', {})).rejects.toMatchObject({
      code: 'ATTACH_FAILED',
    });
  });
});

describe('PaymentStream', () => {
  const endpoint = 'http://localhost:8488';
  const secret = 'test-secret';

  it('should connect to transactions endpoint', () => {
    const stream = new PaymentStream(endpoint, { secret });
    stream.connect();

    const es = (stream as unknown as { eventSource: MockEventSource }).eventSource;
    expect(es.url).toBe(`${endpoint}/payment/v1/channels/transactions?token=${secret}`);
  });

  it('should handle transaction events', async () => {
    const stream = new PaymentStream(endpoint, { secret });
    const handler = vi.fn();

    stream.on('transaction', handler);
    stream.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const es = (stream as unknown as { eventSource: MockEventSource }).eventSource;
    es._emit('transaction', {
      id: 'tx_123',
      channelId: 'order-123',
      basket: [],
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tx_123',
        channelId: 'order-123',
      }),
    );
  });

  it('should create hook from transaction context', async () => {
    const stream = new PaymentStream(endpoint, { secret });
    let createdHook: PaymentHook | null = null;

    stream.on('transaction', (tx: TransactionWithHook) => {
      createdHook = tx.hook();
    });

    stream.connect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const es = (stream as unknown as { eventSource: MockEventSource }).eventSource;
    es._emit('transaction', {
      id: 'tx_123',
      channelId: 'order-123',
      amount: 1000,
      currency: 'usd',
    });

    expect(createdHook).toBeInstanceOf(PaymentHook);
    expect(createdHook!.isConnected).toBe(false); // Will be connected async

    // Wait for hook connection
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(createdHook!.isConnected).toBe(true);
  });
});

describe('Factory functions', () => {
  const endpoint = 'http://localhost:8488';

  it('createEventReader should create EventReader', () => {
    const reader = createEventReader(endpoint, 'channel-1');
    expect(reader).toBeInstanceOf(EventReader);
  });

  it('createPaymentHook should create PaymentHook', () => {
    const hook = createPaymentHook(endpoint, 'channel-1', { secret: 'secret' });
    expect(hook).toBeInstanceOf(PaymentHook);
  });

  it('createPaymentStream should create PaymentStream', () => {
    const stream = createPaymentStream(endpoint, { secret: 'secret' });
    expect(stream).toBeInstanceOf(PaymentStream);
  });
});

describe('ChannelError', () => {
  it('should have correct properties', () => {
    const error = new ChannelError('Test error', 'TEST_CODE');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('ChannelError');
    expect(error).toBeInstanceOf(Error);
  });
});
