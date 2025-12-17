import { CatalogAPI } from './catalog';
import { PaymentAPI } from './payment';

/**
 * Configuration options for the MoneyMQ client
 *
 * @example
 * ```typescript
 * const config: MoneyMQConfig = {
 *   endpoint: 'https://api.moneymq.com',
 *   secret: 'your-api-secret', // Optional
 *   timeout: 30000,
 * };
 * ```
 */
export interface MoneyMQConfig {
  /**
   * MoneyMQ API endpoint
   * @example 'http://localhost:8488' or 'https://api.moneymq.com'
   */
  endpoint: string;
  /**
   * Optional secret key for authenticated requests
   * Used for server-side operations that require authentication
   */
  secret?: string;
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

/**
 * MoneyMQ SDK client for accepting stablecoin payments
 *
 * @example
 * ```typescript
 * import { MoneyMQ } from '@moneymq/sdk';
 *
 * const moneymq = new MoneyMQ({
 *   endpoint: process.env.MONEYMQ_ENDPOINT ?? 'http://localhost:8488',
 * });
 *
 * // Create a product
 * const product = await moneymq.catalog.products.create({
 *   name: 'Pro Plan',
 *   description: 'Full access to all features',
 * });
 *
 * // Create a checkout session
 * const session = await moneymq.payment.checkout.create({
 *   lineItems: [{ price: 'price_xxx', quantity: 1 }],
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 * });
 * ```
 */
export class MoneyMQ {
  public readonly config: MoneyMQConfig;

  /** Catalog API for products and prices */
  public readonly catalog: CatalogAPI;

  /** Payment API for checkout, links, customers, and payouts */
  public readonly payment: PaymentAPI;

  constructor(config: MoneyMQConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };

    this.catalog = new CatalogAPI(this.config);
    this.payment = new PaymentAPI(this.config);
  }

  /**
   * Make an authenticated request to the MoneyMQ API
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.endpoint}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.secret) {
      headers['Authorization'] = `Bearer ${this.config.secret}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new MoneyMQError(
        errorData.message || `Request failed with status ${response.status}`,
        response.status,
        errorData,
      );
    }

    return response.json() as Promise<T>;
  }
}

/**
 * MoneyMQ API error
 */
export class MoneyMQError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'MoneyMQError';
  }
}
