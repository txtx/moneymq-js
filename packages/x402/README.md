# @moneymq/x402

x402 payment protocol utilities for MoneyMQ. Enables HTTP 402 Payment Required flows for micropayments.

## Installation

```bash
npm install @moneymq/x402
# or
pnpm add @moneymq/x402
# or
yarn add @moneymq/x402
```

## What is x402?

The x402 protocol enables native micropayments over HTTP using the `402 Payment Required` status code. When a server returns 402, it includes payment requirements that clients can fulfill to access the resource.

## Usage

### Client-side: Automatic Payment Handling

Use `payUpon402` to wrap HTTP calls with automatic payment handling:

```typescript
import { payUpon402 } from '@moneymq/x402';

// Basic usage - will handle 402 with mock payment (for testing)
const data = await payUpon402(() =>
  fetch('https://api.example.com/premium-data')
);

// With a wallet client for real payments
import { createSigner } from '@moneymq/x402';

const signer = createSigner(privateKey);
const data = await payUpon402(
  () => fetch('https://api.example.com/premium-data'),
  signer,
);

// With custom max value (default: 0.1 USDC)
const data = await payUpon402(
  () => fetch('https://api.example.com/expensive-data'),
  signer,
  BigInt(1_000_000), // 1 USDC max
);
```

### Server-side: Express Middleware

Protect your API endpoints with payment requirements:

```typescript
import express from 'express';
import { createX402Handler, requirePayment } from '@moneymq/x402';

const app = express();

// Full configuration
app.use('/api/premium', createX402Handler({
  price: 100,          // Amount in smallest units (0.0001 USDC)
  currency: 'USDC',
  recipient: 'YourWalletAddress...',
  network: 'solana',   // Optional, defaults to 'solana'
  onPayment: async (payment) => {
    // Called when payment is received
    console.log(`Payment from ${payment.payer}: ${payment.amount}`);
    console.log(`Transaction: ${payment.signature}`);

    // Track usage, update database, etc.
    await trackPayment(payment);
  },
}));

app.get('/api/premium/data', (req, res) => {
  // Only reached after payment is verified
  res.json({ secret: 'Premium content!' });
});

// Shorthand for simple routes
app.get('/api/data',
  requirePayment({
    amount: 50,
    currency: 'USDC',
    recipient: 'YourWallet...',
  }),
  (req, res) => {
    res.json({ data: 'Paid content' });
  }
);
```

### Stripe Integration

Use x402 with Stripe's SDK for a familiar payment experience:

```typescript
import { createStripeClient } from '@moneymq/x402';
import { createSigner } from '@moneymq/x402';

// Create signer from private key
const signer = createSigner(process.env.WALLET_PRIVATE_KEY);

// Create Stripe client with x402 payment handling
const stripe = createStripeClient(
  process.env.STRIPE_API_KEY,
  signer,
);

// Now any Stripe API call that returns 402 will be
// automatically handled with x402 payments
const paymentIntent = await stripe.paymentIntents.create({
  amount: 1000,
  currency: 'usd',
});
```

## API Reference

### payUpon402

Wraps an HTTP call with automatic 402 payment handling.

```typescript
function payUpon402<T>(
  promiseOrFn: Promise<T> | (() => Promise<T>),
  walletClient?: Signer | MultiNetworkSigner,
  maxValue?: bigint,
  config?: X402Config,
): Promise<T>
```

**Parameters:**

- `promiseOrFn` - Either a Promise or a function returning a Promise. Using a function allows retrying after payment.
- `walletClient` - Optional wallet signer for creating payments. Without this, mock payments are used.
- `maxValue` - Maximum payment amount allowed (default: 0.1 USDC = 100000)
- `config` - Optional x402 configuration

**Example:**

```typescript
// Use function syntax for retry support
const data = await payUpon402(() => fetch('/api/data'), signer);

// Promise syntax (no retry on 402)
const data = await payUpon402(fetch('/api/data'));
```

### createX402Handler

Creates Express middleware for handling x402 payments.

```typescript
function createX402Handler(config: X402HandlerConfig): RequestHandler
```

**Config options:**

```typescript
interface X402HandlerConfig {
  price: number;           // Amount in smallest units
  currency: string;        // e.g., 'USDC'
  recipient: string;       // Recipient wallet address
  network?: string;        // Network (default: 'solana')
  onPayment?: (payment: {
    amount: number;
    payer: string;
    signature?: string;
  }) => void | Promise<void>;
}
```

### requirePayment

Shorthand for creating x402 middleware.

```typescript
function requirePayment(options: {
  amount: number;
  currency: string;
  recipient: string;
  network?: string;
}): RequestHandler
```

### createStripeClient

Creates a Stripe client with x402 payment interception.

```typescript
function createStripeClient(
  apiKey: string,
  walletClient?: Signer | MultiNetworkSigner,
  config?: Stripe.StripeConfig,
  x402Config?: X402Config,
): Stripe
```

### createSigner

Re-exported from `x402-fetch` for convenience.

```typescript
import { createSigner } from '@moneymq/x402';

const signer = createSigner(privateKeyBytes);
```

## Types

All x402 types are re-exported:

```typescript
import type {
  PaymentRequirements,
  Signer,
  MultiNetworkSigner,
  X402Config,
} from '@moneymq/x402';
```

## How it Works

1. Client makes request to protected endpoint
2. Server returns `402 Payment Required` with payment requirements in headers/body
3. Client parses requirements and creates payment transaction
4. Client signs transaction with wallet
5. Client retries request with `X-Payment` header containing signed transaction
6. Server verifies payment and grants access

## Supported Networks

- Solana (mainnet, devnet, testnet)
- More coming soon

## License

MIT
