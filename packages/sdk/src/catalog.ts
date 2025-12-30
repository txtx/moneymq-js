import type { MoneyMQConfig } from './client';

// Types

/** Payment requirements returned when payment is required (402) */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  max_amount_required: string;
  resource: string;
  description: string;
  mime_type: string;
  pay_to: string;
  max_timeout_seconds: number;
  asset: string;
  extra?: {
    feePayer?: string;
    product?: string;
  };
}

/** Error thrown when payment is required to access a resource */
export class PaymentRequiredError extends Error {
  constructor(
    message: string,
    public readonly paymentRequirements: PaymentRequirements[],
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'PaymentRequiredError';
  }
}

/** Response from product access endpoint */
export interface ProductAccessResponse {
  object: 'product_access';
  product_id: string;
  access_granted: boolean;
  message: string;
}

/** Parameters for accessing a product with x402 payment */
export interface ProductAccessParams {
  /** Base64-encoded X-Payment header value */
  paymentHeader?: string;
}

export interface Product {
  id: string;
  object: 'product';
  name: string;
  description?: string;
  active: boolean;
  metadata?: Record<string, string>;
  created: number;
  updated: number;
  /** URL path for accessing this product (x402 gated) */
  accessUrl: string;
}

export interface ProductCreateParams {
  name: string;
  description?: string;
  active?: boolean;
  metadata?: Record<string, string>;
}

export interface ProductListParams {
  active?: boolean;
  limit?: number;
  startingAfter?: string;
}

export interface Price {
  id: string;
  object: 'price';
  product: string;
  currency: string;
  amount: number;
  type: 'one_time' | 'recurring';
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    intervalCount: number;
  };
  active: boolean;
  metadata?: Record<string, string>;
  created: number;
}

export interface PriceCreateParams {
  product: string;
  currency: string;
  amount: number;
  type: 'one_time' | 'recurring';
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    intervalCount?: number;
  };
  metadata?: Record<string, string>;
}

// API Classes
class ProductsAPI {
  constructor(private config: MoneyMQConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.secret) headers['Authorization'] = `Bearer ${this.config.secret}`;

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
  }

  /**
   * Create a new product
   */
  async create(params: ProductCreateParams): Promise<Product> {
    return this.request('POST', '/catalog/v1/products', params);
  }

  /**
   * Retrieve a product by ID
   */
  async retrieve(id: string): Promise<Product> {
    return this.request('GET', `/catalog/v1/products/${id}`);
  }

  /**
   * List all products
   */
  async list(params?: ProductListParams): Promise<{ data: Product[]; hasMore: boolean }> {
    const query = new URLSearchParams();
    if (params?.active !== undefined) query.set('active', String(params.active));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.startingAfter) query.set('starting_after', params.startingAfter);

    const queryString = query.toString();
    const result = await this.request<{ data: Product[]; hasMore: boolean }>(
      'GET',
      `/catalog/v1/products${queryString ? `?${queryString}` : ''}`,
    );

    // Add accessUrl to each product (full URL)
    result.data = result.data.map((product) => ({
      ...product,
      accessUrl: `${this.config.endpoint}/catalog/v1/products/${product.id}/access`,
    }));

    return result;
  }

  /**
   * Update a product
   */
  async update(id: string, params: Partial<ProductCreateParams>): Promise<Product> {
    return this.request('PUT', `/catalog/v1/products/${id}`, params);
  }

  /**
   * Delete a product
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.request('DELETE', `/catalog/v1/products/${id}`);
  }

  /**
   * Access a product - gated by x402 payment
   *
   * This endpoint requires payment. If no payment header is provided (or payment is invalid),
   * throws a PaymentRequiredError with the payment requirements.
   *
   * @example
   * ```ts
   * try {
   *   // First attempt without payment - will throw PaymentRequiredError
   *   const access = await moneymq.catalog.products.access('surfnet-max');
   * } catch (error) {
   *   if (error instanceof PaymentRequiredError) {
   *     // Get payment requirements and create payment
   *     const requirements = error.paymentRequirements[0];
   *     const paymentHeader = await createPayment(requirements);
   *
   *     // Retry with payment
   *     const access = await moneymq.catalog.products.access('surfnet-max', {
   *       paymentHeader,
   *     });
   *   }
   * }
   * ```
   */
  async access(id: string, params?: ProductAccessParams): Promise<ProductAccessResponse> {
    const url = `${this.config.endpoint}/catalog/v1/products/${id}/access`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.config.secret) {
      headers['Authorization'] = `Bearer ${this.config.secret}`;
    }

    if (params?.paymentHeader) {
      headers['X-Payment'] = params.paymentHeader;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (response.status === 402) {
      // Payment required - extract payment requirements from x402 response
      const x402Response = (await response.json().catch(() => ({}))) as {
        x402Version?: number;
        accepts?: PaymentRequirements[];
      };

      const paymentRequirements = x402Response.accepts || [];
      throw new PaymentRequiredError(
        'Payment required',
        paymentRequirements,
        x402Response,
      );
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(errorData.message || `Request failed: ${response.status}`);
    }

    return response.json() as Promise<ProductAccessResponse>;
  }
}

class PricesAPI {
  constructor(private config: MoneyMQConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.secret) headers['Authorization'] = `Bearer ${this.config.secret}`;

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
  }

  /**
   * Create a new price
   */
  async create(params: PriceCreateParams): Promise<Price> {
    return this.request('POST', '/catalog/v1/prices', params);
  }

  /**
   * Retrieve a price by ID
   */
  async retrieve(id: string): Promise<Price> {
    return this.request('GET', `/catalog/v1/prices/${id}`);
  }

  /**
   * List all prices
   */
  async list(params?: {
    product?: string;
    active?: boolean;
    limit?: number;
  }): Promise<{ data: Price[]; hasMore: boolean }> {
    const query = new URLSearchParams();
    if (params?.product) query.set('product', params.product);
    if (params?.active !== undefined) query.set('active', String(params.active));
    if (params?.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    return this.request('GET', `/catalog/v1/prices${queryString ? `?${queryString}` : ''}`);
  }
}

/**
 * Catalog API for managing products and prices
 */
export class CatalogAPI {
  /** Products API */
  public readonly products: ProductsAPI;

  /** Prices API */
  public readonly prices: PricesAPI;

  constructor(config: MoneyMQConfig) {
    this.products = new ProductsAPI(config);
    this.prices = new PricesAPI(config);
  }

  /**
   * List all products in the catalog
   * Shorthand for moneymq.catalog.products.list()
   */
  async list(params?: ProductListParams): Promise<{ data: Product[]; hasMore: boolean }> {
    return this.products.list(params);
  }

  /**
   * Create a new product
   * Shorthand for moneymq.catalog.products.create()
   */
  async create(params: ProductCreateParams): Promise<Product> {
    return this.products.create(params);
  }

  /**
   * Retrieve a product by ID
   * Shorthand for moneymq.catalog.products.retrieve()
   */
  async retrieve(id: string): Promise<Product> {
    return this.products.retrieve(id);
  }

  /**
   * Update a product
   * Shorthand for moneymq.catalog.products.update()
   */
  async update(id: string, params: Partial<ProductCreateParams>): Promise<Product> {
    return this.products.update(id, params);
  }

  /**
   * Delete a product
   * Shorthand for moneymq.catalog.products.delete()
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.products.delete(id);
  }

  /**
   * Access a product - gated by x402 payment
   * Shorthand for moneymq.catalog.products.access()
   */
  async access(id: string, params?: ProductAccessParams): Promise<ProductAccessResponse> {
    return this.products.access(id, params);
  }
}
