import type { MoneyMQConfig } from './client';

// Types
export interface LineItem {
  price: string;
  quantity: number;
}

export interface CheckoutSession {
  id: string;
  object: 'checkout.session';
  url: string;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'unpaid' | 'paid';
  customer?: string;
  lineItems: LineItem[];
  successUrl: string;
  cancelUrl: string;
  expiresAt: number;
  created: number;
}

export interface CheckoutCreateParams {
  lineItems: LineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  customer?: string;
  metadata?: Record<string, string>;
}

export interface PaymentLink {
  id: string;
  object: 'payment_link';
  url: string;
  active: boolean;
  lineItems: LineItem[];
  expiresAt?: number;
  created: number;
}

export interface PaymentLinkCreateParams {
  lineItems: LineItem[];
  expiresAt?: Date | number;
  metadata?: Record<string, string>;
}

export interface Payment {
  id: string;
  object: 'payment';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  customer?: string;
  checkout?: string;
  signature?: string;
  metadata?: Record<string, string>;
  created: number;
}

export interface PaymentListParams {
  customerId?: string;
  status?: 'completed' | 'pending' | 'failed';
  limit?: number;
  startingAfter?: string;
}

// Simple pay params - for one-liner payments
export interface PayParams {
  /** Amount in smallest currency unit (e.g., cents for USD) */
  amount: number;
  /** Currency code (e.g., 'usd', 'usdc') */
  currency: string;
  /** Product name for display */
  productName: string;
  /** Product ID for tracking */
  productId?: string;
  /** Optional product description */
  description?: string;
  /** Customer wallet address */
  customer?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
}

export interface PayResult {
  /** Checkout session ID */
  sessionId: string;
  /** Payment intent ID */
  paymentIntentId: string;
  /** Client secret for confirming payment */
  clientSecret: string;
  /** Total amount in smallest currency unit */
  amount: number;
  /** Currency */
  currency: string;
  /** Status */
  status: 'requires_confirmation' | 'succeeded' | 'failed';
}

// Payment Intent types (simpler than checkout sessions)
export interface PaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'canceled';
  customer?: string;
  description?: string;
  metadata: Record<string, string>;
  clientSecret?: string;
  created: number;
}

export interface PaymentIntentCreateParams {
  /** Amount in smallest currency unit */
  amount: number;
  /** Currency code */
  currency: string;
  /** Customer wallet address */
  customer?: string;
  /** Description */
  description?: string;
  /** Metadata including product info */
  metadata?: Record<string, string>;
}

export interface Customer {
  id: string;
  object: 'customer';
  email: string;
  name?: string;
  metadata?: Record<string, string>;
  subscriptions?: unknown[];
  payments?: Payment[];
  created: number;
}

export interface CustomerCreateParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CustomerUpdateParams {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface Payout {
  id: string;
  object: 'payout';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  destination: string;
  created: number;
}

export interface PayoutCreateParams {
  amount: number;
  currency: string;
  destination: string;
}

export interface PayoutListParams {
  status?: 'pending' | 'completed' | 'failed';
  limit?: number;
  startingAfter?: string;
}

export interface PayoutSettings {
  destination: {
    type: 'wallet';
    address: string;
    currency: string;
  };
  schedule: 'instant' | 'daily' | 'weekly' | 'monthly';
  minimumAmount?: number;
}

export interface PayoutSettingsUpdateParams {
  destination?: PayoutSettings['destination'];
  schedule?: PayoutSettings['schedule'];
  minimumAmount?: number;
}

// Helper for making requests
function createRequester(config: MoneyMQConfig) {
  return async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${config.endpoint}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.secret) headers['Authorization'] = `Bearer ${config.secret}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  };
}

// API Classes
class CheckoutAPI {
  private request: ReturnType<typeof createRequester>;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
  }

  /**
   * Create a checkout session
   */
  async create(params: CheckoutCreateParams): Promise<CheckoutSession> {
    return this.request('POST', '/payment/v1/checkout', params);
  }

  /**
   * Retrieve a checkout session
   */
  async retrieve(id: string): Promise<CheckoutSession> {
    return this.request('GET', `/payment/v1/checkout/${id}`);
  }
}

class LinksAPI {
  private request: ReturnType<typeof createRequester>;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
  }

  /**
   * Create a payment link
   */
  async create(params: PaymentLinkCreateParams): Promise<PaymentLink> {
    return this.request('POST', '/payment/v1/links', {
      ...params,
      expiresAt: params.expiresAt instanceof Date ? params.expiresAt.getTime() : params.expiresAt,
    });
  }

  /**
   * Retrieve a payment link
   */
  async retrieve(id: string): Promise<PaymentLink> {
    return this.request('GET', `/payment/v1/links/${id}`);
  }

  /**
   * Deactivate a payment link
   */
  async deactivate(id: string): Promise<PaymentLink> {
    return this.request('PUT', `/payment/v1/links/${id}`, { active: false });
  }
}

class CustomersAPI {
  private request: ReturnType<typeof createRequester>;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
  }

  /**
   * Create a customer
   */
  async create(params: CustomerCreateParams): Promise<Customer> {
    return this.request('POST', '/payment/v1/customers', params);
  }

  /**
   * Retrieve a customer
   */
  async retrieve(id: string, options?: { expand?: string[] }): Promise<Customer> {
    const query = options?.expand ? `?expand=${options.expand.join(',')}` : '';
    return this.request('GET', `/payment/v1/customers/${id}${query}`);
  }

  /**
   * Update a customer
   */
  async update(id: string, params: CustomerUpdateParams): Promise<Customer> {
    return this.request('PUT', `/payment/v1/customers/${id}`, params);
  }

  /**
   * List customers
   */
  async list(params?: {
    email?: string;
    limit?: number;
  }): Promise<{ data: Customer[]; hasMore: boolean }> {
    const query = new URLSearchParams();
    if (params?.email) query.set('email', params.email);
    if (params?.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    return this.request('GET', `/payment/v1/customers${queryString ? `?${queryString}` : ''}`);
  }
}

class PayoutsAPI {
  private request: ReturnType<typeof createRequester>;

  /** Payout settings */
  public readonly settings: PayoutSettingsAPI;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
    this.settings = new PayoutSettingsAPI(config);
  }

  /**
   * Create a manual payout
   */
  async create(params: PayoutCreateParams): Promise<Payout> {
    return this.request('POST', '/payment/v1/payouts', params);
  }

  /**
   * Retrieve a payout
   */
  async retrieve(id: string): Promise<Payout> {
    return this.request('GET', `/payment/v1/payouts/${id}`);
  }

  /**
   * List payouts
   */
  async list(params?: PayoutListParams): Promise<{ data: Payout[]; hasMore: boolean }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.startingAfter) query.set('starting_after', params.startingAfter);

    const queryString = query.toString();
    return this.request('GET', `/payment/v1/payouts${queryString ? `?${queryString}` : ''}`);
  }
}

class PayoutSettingsAPI {
  private request: ReturnType<typeof createRequester>;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
  }

  /**
   * Get payout settings
   */
  async retrieve(): Promise<PayoutSettings> {
    return this.request('GET', '/payment/v1/payouts/settings');
  }

  /**
   * Update payout settings
   */
  async update(params: PayoutSettingsUpdateParams): Promise<PayoutSettings> {
    return this.request('PUT', '/payment/v1/payouts/settings', params);
  }
}

class WebhooksAPI {
  private request: ReturnType<typeof createRequester>;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
  }

  /**
   * Trigger a test webhook event (for testing)
   */
  async trigger(event: string, data: Record<string, unknown>): Promise<{ success: boolean }> {
    return this.request('POST', '/payment/v1/webhooks/test', { event, data });
  }
}

/**
 * Payment Intents API - for direct payments without full checkout flow
 * Similar to Stripe's Payment Intents API
 */
class PaymentIntentsAPI {
  private request: ReturnType<typeof createRequester>;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
  }

  /**
   * Create a payment intent
   * Use this for simple payments without the full checkout session flow
   */
  async create(params: PaymentIntentCreateParams): Promise<PaymentIntent> {
    return this.request('POST', '/catalog/v1/payment_intents', params);
  }

  /**
   * Retrieve a payment intent
   */
  async retrieve(id: string): Promise<PaymentIntent> {
    return this.request('GET', `/catalog/v1/payment_intents/${id}`);
  }

  /**
   * Confirm a payment intent
   * This triggers the actual payment (and x402 flow if required)
   */
  async confirm(id: string): Promise<PaymentIntent> {
    return this.request('POST', `/catalog/v1/payment_intents/${id}/confirm`, {});
  }

  /**
   * Cancel a payment intent
   */
  async cancel(id: string): Promise<PaymentIntent> {
    return this.request('POST', `/catalog/v1/payment_intents/${id}/cancel`, {});
  }
}

/**
 * Payment API for checkout, links, customers, and payouts
 */
export class PaymentAPI {
  private request: ReturnType<typeof createRequester>;

  /** Checkout sessions API - for full e-commerce flows with line items */
  public readonly checkout: CheckoutAPI;

  /** Payment intents API - for simpler direct payments */
  public readonly intents: PaymentIntentsAPI;

  /** Payment links API */
  public readonly links: LinksAPI;

  /** Customers API */
  public readonly customers: CustomersAPI;

  /** Payouts API */
  public readonly payouts: PayoutsAPI;

  /** Webhooks API */
  public readonly webhooks: WebhooksAPI;

  constructor(config: MoneyMQConfig) {
    this.request = createRequester(config);
    this.checkout = new CheckoutAPI(config);
    this.intents = new PaymentIntentsAPI(config);
    this.links = new LinksAPI(config);
    this.customers = new CustomersAPI(config);
    this.payouts = new PayoutsAPI(config);
    this.webhooks = new WebhooksAPI(config);
  }

  /**
   * Simple one-liner payment - creates a checkout session with inline product data
   *
   * @example
   * ```ts
   * const result = await moneymq.payment.pay({
   *   amount: 999,
   *   currency: 'usd',
   *   productName: 'Pro Plan',
   *   productId: 'pro-plan',
   *   customer: 'wallet_address',
   * });
   * ```
   */
  async pay(params: PayParams): Promise<PayResult> {
    // Create a checkout session with inline price_data
    const session = await this.request<{
      id: string;
      payment_intent: string;
      client_secret: string;
      amount_total: number;
      currency: string;
      status: string;
    }>('POST', '/catalog/v1/checkout/sessions', {
      line_items: [
        {
          price_data: {
            currency: params.currency,
            unit_amount: params.amount,
            product_data: {
              name: params.productName,
              description: params.description,
              metadata: {
                product_id: params.productId || params.productName.toLowerCase().replace(/\s+/g, '-'),
              },
            },
          },
          quantity: 1,
        },
      ],
      customer: params.customer,
      metadata: params.metadata,
      mode: 'payment',
    });

    return {
      sessionId: session.id,
      paymentIntentId: session.payment_intent,
      clientSecret: session.client_secret,
      amount: session.amount_total,
      currency: session.currency,
      status: 'requires_confirmation',
    };
  }

  /**
   * Retrieve a payment by ID
   */
  async retrieve(id: string): Promise<Payment> {
    return this.request('GET', `/payment/v1/${id}`);
  }

  /**
   * List payments
   */
  async list(params?: PaymentListParams): Promise<{ data: Payment[]; hasMore: boolean }> {
    const query = new URLSearchParams();
    if (params?.customerId) query.set('customer', params.customerId);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.startingAfter) query.set('starting_after', params.startingAfter);

    const queryString = query.toString();
    return this.request('GET', `/payment/v1${queryString ? `?${queryString}` : ''}`);
  }
}
