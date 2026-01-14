# MoneyMQ Event Architecture

## Overview

MoneyMQ provides a pub/sub event system over Server-Sent Events (SSE) that enables real-time communication between the payment backend and client applications.

### Key Concepts

- **Channels**: Named streams of events scoped to transactions or custom identifiers
- **Reader**: Subscribe-only client for frontend applications
- **PaymentHook**: Subscribe + publish client for backend applications
- **PaymentStream**: Meta-listener that spawns hooks for each new transaction

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           MoneyMQ Server                            │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │  Payment    │───▶│   Channel   │───▶│  SSE Broadcast          │ │
│  │  Engine     │    │   Manager   │    │  (all subscribers)      │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│                            ▲                                        │
│                            │ POST /channels/{id}/events             │
│                            │                                        │
└────────────────────────────┼────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────┴────┐         ┌─────┴─────┐        ┌────┴────┐
   │ Reader  │         │   Hook    │        │ Reader  │
   │ (SSE)   │         │ (SSE+HTTP)│        │ (SSE)   │
   └─────────┘         └───────────┘        └─────────┘
    Frontend             Backend             Frontend
```

## API Design

### Reader (Frontend - Subscribe Only)

```typescript
import { MoneyMQ } from '@moneymq/sdk';

const moneymq = new MoneyMQ({
  endpoint: 'http://localhost:8488',
});

// Create a reader for a specific channel
const reader = moneymq.events.reader('order-abc123');

// With options
const reader = moneymq.events.reader('order-abc123', {
  replay: 10,  // Replay last 10 events on connect
});

// Subscribe to events
reader.on('payment:verified', (event) => {
  console.log('Payment verified:', event.data);
});

reader.on('payment:settled', (event) => {
  showToast(`Payment received: ${event.data.amount} USDC`);
});

// Custom events from backend actor
reader.on('order:completed', (event) => {
  updateUI(event.data.trackingNumber);
});

// Connection lifecycle
reader.on('connected', () => console.log('Connected'));
reader.on('disconnected', () => console.log('Disconnected'));
reader.on('error', (err) => console.error(err));

// Connect to start receiving events
reader.connect();

// Disconnect when done
reader.disconnect();
```

### PaymentHook (Backend - Subscribe + Attach)

```typescript
import { MoneyMQ } from '@moneymq/sdk';

const moneymq = new MoneyMQ({
  endpoint: 'http://localhost:8488',
});

// Create a hook for a specific channel (requires secret)
const hook = moneymq.events.hook('order-abc123', {
  secret: process.env.MONEYMQ_SECRET,
});

// With replay
const hook = moneymq.events.hook('order-abc123', {
  secret: process.env.MONEYMQ_SECRET,
  replay: 10,
});

// Subscribe to payment events
hook.on('payment:verified', async (event) => {
  await db.orders.create({
    id: event.data.metadata?.orderId,
    payer: event.data.payer,
    status: 'pending',
  });
});

hook.on('payment:settled', async (event) => {
  const order = await db.orders.update(event.data.metadata?.orderId, {
    status: 'paid',
  });

  const shipment = await shipOrder(order);

  // Attach fulfillment data - server creates signed receipt
  await hook.attach('fulfillment', {
    orderId: order.id,
    trackingNumber: shipment.tracking,
    estimatedDelivery: shipment.eta,
  });
});

hook.connect();
```

### PaymentStream (Backend - Transaction Spawner)

```typescript
import { MoneyMQ } from '@moneymq/sdk';

const moneymq = new MoneyMQ({
  endpoint: 'http://localhost:8488',
});

// Create a payment stream that listens for new transactions
const stream = moneymq.payment.paymentStream({
  secret: process.env.MONEYMQ_SECRET,
});

// Called for each new transaction
stream.on('transaction', (tx) => {
  console.log('New transaction:', tx.id, tx.payment?.amount, tx.basket[0]?.productId);

  // Get a hook scoped to this transaction's channel
  const hook = tx.hook();

  hook.on('payment:verified', async (event) => {
    // Handle verification
  });

  hook.on('payment:settled', async (event) => {
    // Handle settlement
    await hook.attach('fulfillment', { orderId: tx.id });
  });

  // Hook auto-connects when created from transaction
});

// Connect to start receiving transactions
stream.connect();
```

## Event Types

### Payment Events (from MoneyMQ)

| Event Type | Description | Data |
|------------|-------------|------|
| `payment:verified` | Payment signature verified on-chain | `PaymentVerifiedData` |
| `payment:settled` | Payment settled to recipient | `PaymentSettledData` |
| `payment:failed` | Payment failed | `PaymentFailedData` |

### Fulfillment Data (from PaymentHook)

Hooks attach fulfillment data that gets included in signed receipts:

```typescript
hook.attach('fulfillment', { orderId, trackingNumber });
hook.attach('subscription', { subscriptionId, nextBillingDate });
hook.attach('download', { url, expiresAt });
```

## Transport

### SSE Endpoints

```
GET /payment/v1/channels/{channelId}
  Query params:
    - replay: number (optional) - replay last N events
    - token: string (optional) - auth token for actors

  Response: SSE stream
    event: message
    data: {"type":"payment:verified","data":{...},"id":"evt_xxx","time":"..."}

    event: message
    data: {"type":"order:completed","data":{...},"id":"evt_xxx","time":"..."}
```

### HTTP Endpoints

```
POST /payment/v1/channels/{channelId}/events
  Headers:
    - Authorization: Bearer {secret} (required)
    - Content-Type: application/json

  Body:
    {
      "type": "order:completed",
      "data": { "orderId": "...", "trackingNumber": "..." }
    }

  Response: 201 Created
    {
      "id": "evt_xxx",
      "type": "order:completed",
      "data": { ... },
      "time": "2025-01-02T..."
    }
```

### Receiver SSE

```
GET /payment/v1/channels/transactions
  Query params:
    - token: string (required) - auth token

  Response: SSE stream
    event: transaction
    data: {"id":"tx_xxx","channelId":"order-xxx","amount":1000,"productId":"..."}
```

## Type Definitions

```typescript
// Channel options
interface ReaderOptions {
  replay?: number;
}

interface PaymentHookOptions extends ReaderOptions {
  secret: string;
}

interface PaymentStreamOptions {
  secret: string;
}

// Transaction from payment stream
interface TransactionWithHook {
  id: string;
  channelId: string;
  basket: BasketItem[];
  payment?: PaymentDetails;
  metadata?: Record<string, unknown>;
  hook(): PaymentHook;
}

// Event envelope
interface ChannelEvent<T = unknown> {
  id: string;
  type: string;
  data: T;
  time: string;
}

// Payment event data
interface PaymentVerifiedData {
  transactionId: string;
  payer: string;
  amount: number;
  currency: string;
  signature: string;
  metadata?: Record<string, unknown>;
}

interface PaymentSettledData extends PaymentVerifiedData {
  recipient: string;
  settledAt: string;
}

interface PaymentFailedData {
  transactionId: string;
  payer: string;
  error: string;
  code: string;
}

// Event handlers
type EventHandler<T = unknown> = (event: ChannelEvent<T>) => void | Promise<void>;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Error) => void;
```

## Connection States

```
disconnected ──▶ connecting ──▶ connected
      ▲                              │
      │                              │
      └────── disconnected ◀─────────┘
                   │
                   ▼
              reconnecting ──▶ connecting
```

## Error Handling

```typescript
reader.on('error', (error) => {
  if (error.code === 'UNAUTHORIZED') {
    // Invalid or missing secret for actor
  } else if (error.code === 'CHANNEL_NOT_FOUND') {
    // Channel doesn't exist
  } else if (error.code === 'CONNECTION_FAILED') {
    // Network error, will auto-reconnect
  }
});
```

## Implementation Plan

### Phase 1: Core Classes

1. **EventReader** - SSE subscription only
   - `on(event, handler)` / `off(event, handler)`
   - `connect()` / `disconnect()`
   - Connection state management
   - Auto-reconnection

2. **PaymentHook** - Extends reader with attach
   - Everything from EventReader
   - `attach(key, data)` - HTTP POST to attachments endpoint
   - Authorization header handling

3. **PaymentStream** - Transaction listener
   - SSE subscription to `/payment/v1/channels/transactions`
   - `on('transaction', handler)`
   - Factory for creating scoped hooks

### Phase 2: Integration

4. **MoneyMQ Client Updates**
   - Add `events.reader(channelId, options?)`
   - Add `events.hook(channelId, options)`
   - Add `payment.paymentStream(options)`
   - Deprecate legacy `events.stream()` (keep for backward compat)

### Phase 3: Testing

5. **Unit Tests**
   - EventReader connection lifecycle
   - PaymentHook attach method
   - PaymentStream transaction handling
   - Error handling scenarios

### Phase 4: Documentation

6. **Update README and examples**
