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
    const url = `${config.url}${path}`;
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
    return this.request('POST', '/payment/checkout', params);
  }

  /**
   * Retrieve a checkout session
   */
  async retrieve(id: string): Promise<CheckoutSession> {
    return this.request('GET', `/payment/checkout/${id}`);
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
    return this.request('POST', '/payment/links', {
      ...params,
      expiresAt: params.expiresAt instanceof Date ? params.expiresAt.getTime() : params.expiresAt,
    });
  }

  /**
   * Retrieve a payment link
   */
  async retrieve(id: string): Promise<PaymentLink> {
    return this.request('GET', `/payment/links/${id}`);
  }

  /**
   * Deactivate a payment link
   */
  async deactivate(id: string): Promise<PaymentLink> {
    return this.request('PUT', `/payment/links/${id}`, { active: false });
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
    return this.request('POST', '/payment/customers', params);
  }

  /**
   * Retrieve a customer
   */
  async retrieve(id: string, options?: { expand?: string[] }): Promise<Customer> {
    const query = options?.expand ? `?expand=${options.expand.join(',')}` : '';
    return this.request('GET', `/payment/customers/${id}${query}`);
  }

  /**
   * Update a customer
   */
  async update(id: string, params: CustomerUpdateParams): Promise<Customer> {
    return this.request('PUT', `/payment/customers/${id}`, params);
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
    return this.request('GET', `/payment/customers${queryString ? `?${queryString}` : ''}`);
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
    return this.request('POST', '/payment/payouts', params);
  }

  /**
   * Retrieve a payout
   */
  async retrieve(id: string): Promise<Payout> {
    return this.request('GET', `/payment/payouts/${id}`);
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
    return this.request('GET', `/payment/payouts${queryString ? `?${queryString}` : ''}`);
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
    return this.request('GET', '/payment/payouts/settings');
  }

  /**
   * Update payout settings
   */
  async update(params: PayoutSettingsUpdateParams): Promise<PayoutSettings> {
    return this.request('PUT', '/payment/payouts/settings', params);
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
    return this.request('POST', '/payment/webhooks/test', { event, data });
  }
}

/**
 * Payment API for checkout, links, customers, and payouts
 */
export class PaymentAPI {
  private request: ReturnType<typeof createRequester>;

  /** Checkout sessions API */
  public readonly checkout: CheckoutAPI;

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
    this.links = new LinksAPI(config);
    this.customers = new CustomersAPI(config);
    this.payouts = new PayoutsAPI(config);
    this.webhooks = new WebhooksAPI(config);
  }

  /**
   * Retrieve a payment by ID
   */
  async retrieve(id: string): Promise<Payment> {
    return this.request('GET', `/payment/${id}`);
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
    return this.request('GET', `/payment${queryString ? `?${queryString}` : ''}`);
  }
}
