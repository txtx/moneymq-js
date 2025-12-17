import type { MoneyMQConfig } from './client';

// Types
export interface Product {
  id: string;
  object: 'product';
  name: string;
  description?: string;
  active: boolean;
  metadata?: Record<string, string>;
  created: number;
  updated: number;
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
    const url = `${this.config.url}${path}`;
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
    return this.request('POST', '/v1/products', params);
  }

  /**
   * Retrieve a product by ID
   */
  async retrieve(id: string): Promise<Product> {
    return this.request('GET', `/v1/products/${id}`);
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
    return this.request('GET', `/v1/products${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Update a product
   */
  async update(id: string, params: Partial<ProductCreateParams>): Promise<Product> {
    return this.request('PUT', `/v1/products/${id}`, params);
  }

  /**
   * Delete a product
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.request('DELETE', `/v1/products/${id}`);
  }
}

class PricesAPI {
  constructor(private config: MoneyMQConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.url}${path}`;
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
    return this.request('POST', '/v1/prices', params);
  }

  /**
   * Retrieve a price by ID
   */
  async retrieve(id: string): Promise<Price> {
    return this.request('GET', `/v1/prices/${id}`);
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
    return this.request('GET', `/v1/prices${queryString ? `?${queryString}` : ''}`);
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
}
