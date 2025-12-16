# @moneymq/sdk

Core SDK for the MoneyMQ payment platform. Accept stablecoin payments with a Stripe-like API.

## Installation

```bash
npm install @moneymq/sdk
# or
pnpm add @moneymq/sdk
# or
yarn add @moneymq/sdk
```

## Quick Start

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
  amount: 1000,
  type: 'one_time',
});

// Create a checkout session
const session = await moneymq.payment.checkout.create({
  lineItems: [{ price: price.id, quantity: 1 }],
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
});
```

## Configuration

```typescript
const moneymq = new MoneyMQ({
  // Required: MoneyMQ API URL
  url: 'http://localhost:8488',

  // Optional: Secret key for authenticated requests
  secret: process.env.MONEYMQ_SECRET,

  // Optional: Request timeout in milliseconds (default: 30000)
  timeout: 30000,
});
```

## API Reference

### Catalog

#### Products

```typescript
// Create a product
const product = await moneymq.catalog.products.create({
  name: 'Pro Plan',
  description: 'Full access',
  active: true,
  metadata: { tier: 'premium' },
});

// Retrieve a product
const product = await moneymq.catalog.products.retrieve('prod_123');

// List products
const { data, hasMore } = await moneymq.catalog.products.list({
  active: true,
  limit: 10,
});

// Update a product
const updated = await moneymq.catalog.products.update('prod_123', {
  name: 'Enterprise Plan',
});

// Delete a product
await moneymq.catalog.products.delete('prod_123');
```

#### Prices

```typescript
// Create a one-time price
const price = await moneymq.catalog.prices.create({
  product: 'prod_123',
  currency: 'USDC',
  amount: 1000,
  type: 'one_time',
});

// Create a recurring price
const subscription = await moneymq.catalog.prices.create({
  product: 'prod_123',
  currency: 'USDC',
  amount: 9900,
  type: 'recurring',
  recurring: {
    interval: 'month',
    intervalCount: 1,
  },
});

// Retrieve a price
const price = await moneymq.catalog.prices.retrieve('price_123');

// List prices
const { data } = await moneymq.catalog.prices.list({
  product: 'prod_123',
  active: true,
});
```

### Payment

#### Checkout Sessions

```typescript
// Create a checkout session
const session = await moneymq.payment.checkout.create({
  lineItems: [
    { price: 'price_123', quantity: 1 },
  ],
  successUrl: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://example.com/cancel',
  customer: 'cus_123', // Optional
  customerEmail: 'user@example.com', // Optional
  metadata: { orderId: '12345' },
});

// Retrieve a session
const session = await moneymq.payment.checkout.retrieve('cs_123');
```

#### Payment Links

```typescript
// Create a payment link
const link = await moneymq.payment.links.create({
  lineItems: [{ price: 'price_123', quantity: 1 }],
  expiresAt: new Date('2025-12-31'),
});

// Retrieve a link
const link = await moneymq.payment.links.retrieve('plink_123');

// Deactivate a link
await moneymq.payment.links.deactivate('plink_123');
```

#### Customers

```typescript
// Create a customer
const customer = await moneymq.payment.customers.create({
  email: 'user@example.com',
  name: 'John Doe',
  metadata: { userId: '123' },
});

// Retrieve with expanded fields
const customer = await moneymq.payment.customers.retrieve('cus_123', {
  expand: ['payments', 'subscriptions'],
});

// Update a customer
await moneymq.payment.customers.update('cus_123', {
  name: 'Jane Doe',
});

// List customers
const { data } = await moneymq.payment.customers.list({
  email: 'user@example.com',
});
```

#### Payments

```typescript
// Retrieve a payment
const payment = await moneymq.payment.retrieve('pay_123');

// List payments
const { data } = await moneymq.payment.list({
  customerId: 'cus_123',
  status: 'completed',
  limit: 20,
});
```

#### Payouts

```typescript
// Create a payout
const payout = await moneymq.payment.payouts.create({
  amount: 100000,
  currency: 'USDC',
  destination: 'wallet_address',
});

// Get payout settings
const settings = await moneymq.payment.payouts.settings.retrieve();

// Update payout settings
await moneymq.payment.payouts.settings.update({
  schedule: 'daily',
  minimumAmount: 10000,
});
```

## Error Handling

```typescript
import { MoneyMQ, MoneyMQError } from '@moneymq/sdk';

try {
  await moneymq.catalog.products.retrieve('invalid_id');
} catch (error) {
  if (error instanceof MoneyMQError) {
    console.error('Status:', error.statusCode);
    console.error('Message:', error.message);
    console.error('Raw:', error.raw);
  }
}
```

## TypeScript Support

This package includes full TypeScript definitions. All types are exported:

```typescript
import type {
  MoneyMQConfig,
  Product,
  ProductCreateParams,
  Price,
  PriceCreateParams,
  CheckoutSession,
  CheckoutCreateParams,
  PaymentLink,
  Customer,
  Payment,
  Payout,
} from '@moneymq/sdk';
```

## License

MIT
