# MoneyMQ JavaScript SDK

[![npm version](https://img.shields.io/npm/v/@moneymq/sdk.svg)](https://www.npmjs.com/package/@moneymq/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/txtx/moneymq-js/actions/workflows/ci.yml/badge.svg)](https://github.com/txtx/moneymq-js/actions/workflows/ci.yml)

JavaScript/TypeScript SDK for accepting stablecoin payments with MoneyMQ.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [@moneymq/sdk](./packages/sdk) | Core SDK for MoneyMQ API | [![npm](https://img.shields.io/npm/v/@moneymq/sdk.svg)](https://www.npmjs.com/package/@moneymq/sdk) |
| [@moneymq/x402](./packages/x402) | x402 payment protocol utilities | [![npm](https://img.shields.io/npm/v/@moneymq/x402.svg)](https://www.npmjs.com/package/@moneymq/x402) |

## Installation

```bash
# Core SDK
npm install @moneymq/sdk

# x402 protocol support
npm install @moneymq/x402
```

## Quick Start

### Using the SDK

```typescript
import { MoneyMQ } from '@moneymq/sdk';

const moneymq = new MoneyMQ({
  url: 'http://localhost:8488',
});

// Create a product
const product = await moneymq.catalog.products.create({
  name: 'Pro Plan',
  description: 'Full access to all features',
});

// Create a price
const price = await moneymq.catalog.prices.create({
  product: product.id,
  currency: 'USDC',
  amount: 1000, // $0.001 USDC (in smallest units)
  type: 'one_time',
});

// Create a checkout session
const session = await moneymq.payment.checkout.create({
  lineItems: [{ price: price.id, quantity: 1 }],
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
});

console.log('Checkout URL:', session.url);
```

### Using x402 Protocol

#### Client-side: Automatic Payment Handling

```typescript
import { payUpon402 } from '@moneymq/x402';

// Automatically handles 402 Payment Required responses
const response = await payUpon402(
  () => fetch('https://api.example.com/premium-endpoint'),
  walletClient, // Optional: for actual payments
);
```

#### Server-side: Express Middleware

```typescript
import express from 'express';
import { createX402Handler, requirePayment } from '@moneymq/x402';

const app = express();

// Full configuration
app.use('/api/premium', createX402Handler({
  price: 100, // 0.0001 USDC
  currency: 'USDC',
  recipient: 'YourWalletAddress...',
  onPayment: async (payment) => {
    console.log(`Received payment from ${payment.payer}`);
  },
}));

// Shorthand
app.get('/api/data', requirePayment({
  amount: 50,
  currency: 'USDC',
  recipient: 'YourWalletAddress...',
}), (req, res) => {
  res.json({ data: 'Premium content' });
});
```

## API Reference

### @moneymq/sdk

#### MoneyMQ Client

```typescript
const moneymq = new MoneyMQ({
  url: string,      // MoneyMQ API URL
  secret?: string,  // Optional: for authenticated requests
  timeout?: number, // Request timeout (default: 30000ms)
});
```

#### Catalog API

```typescript
// Products
moneymq.catalog.products.create({ name, description?, metadata? })
moneymq.catalog.products.retrieve(id)
moneymq.catalog.products.list({ active?, limit?, startingAfter? })
moneymq.catalog.products.update(id, { name?, description?, active?, metadata? })
moneymq.catalog.products.delete(id)

// Prices
moneymq.catalog.prices.create({ product, currency, amount, type, recurring?, metadata? })
moneymq.catalog.prices.retrieve(id)
moneymq.catalog.prices.list({ product?, active?, limit? })
```

#### Payment API

```typescript
// Checkout Sessions
moneymq.payment.checkout.create({ lineItems, successUrl, cancelUrl, customer?, metadata? })
moneymq.payment.checkout.retrieve(id)

// Payment Links
moneymq.payment.links.create({ lineItems, expiresAt?, metadata? })
moneymq.payment.links.retrieve(id)
moneymq.payment.links.deactivate(id)

// Customers
moneymq.payment.customers.create({ email, name?, metadata? })
moneymq.payment.customers.retrieve(id, { expand? })
moneymq.payment.customers.update(id, { email?, name?, metadata? })
moneymq.payment.customers.list({ email?, limit? })

// Payments
moneymq.payment.retrieve(id)
moneymq.payment.list({ customerId?, status?, limit?, startingAfter? })

// Payouts
moneymq.payment.payouts.create({ amount, currency, destination })
moneymq.payment.payouts.retrieve(id)
moneymq.payment.payouts.list({ status?, limit?, startingAfter? })
moneymq.payment.payouts.settings.retrieve()
moneymq.payment.payouts.settings.update({ destination?, schedule?, minimumAmount? })
```

### @moneymq/x402

#### payUpon402

Wraps HTTP calls with automatic 402 Payment Required handling.

```typescript
payUpon402<T>(
  promiseOrFn: Promise<T> | (() => Promise<T>),
  walletClient?: Signer | MultiNetworkSigner,
  maxValue?: bigint,  // Default: 0.1 USDC
  config?: X402Config,
): Promise<T>
```

#### createX402Handler

Creates Express middleware for x402 payment handling.

```typescript
createX402Handler({
  price: number,           // Amount in smallest units
  currency: string,        // e.g., 'USDC'
  recipient: string,       // Wallet address
  network?: string,        // Default: 'solana'
  onPayment?: (payment) => void | Promise<void>,
})
```

#### createStripeClient

Creates a Stripe client with automatic x402 payment handling.

```typescript
createStripeClient(
  apiKey: string,
  walletClient?: Signer | MultiNetworkSigner,
  config?: Stripe.StripeConfig,
  x402Config?: X402Config,
): Stripe
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Format code
pnpm format
```

## Releasing

Releases are managed via GitHub Actions with npm Trusted Publishing.

### Version Bumping

All packages share the same version. When you bump the root version, all packages are automatically synced:

```bash
# Bump version (patch, minor, or major)
npm version patch

# Push the commit and tag
git push && git push --tags
```

The `npm version` command automatically:
1. Updates the root `package.json` version
2. Runs the sync script to update all packages in `packages/*/package.json`
3. Creates a git commit and tag

### Publishing to npm

1. After pushing the version bump, go to [GitHub Actions](https://github.com/txtx/moneymq-js/actions/workflows/release.yml)
2. Click "Run workflow"
3. Optionally enable "Dry run" to test without publishing
4. Click "Run workflow" to start the release

The workflow will:
- Build and test all packages
- Validate version consistency across packages
- Create a git tag (if not already created)
- Publish `@moneymq/sdk` and `@moneymq/x402` to npm with provenance
- Create a GitHub Release with auto-generated release notes

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](./LICENSE) for details.
