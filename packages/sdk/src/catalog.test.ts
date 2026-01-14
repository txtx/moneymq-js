import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MoneyMQ } from './client';
import type { Product, Price } from './catalog';

describe('CatalogAPI', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;
  let client: MoneyMQ;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    client = new MoneyMQ({ endpoint: 'http://localhost:8488' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('list (shorthand)', () => {
    const mockProduct = {
      id: 'prod_123',
      object: 'product',
      name: 'Test Product',
      description: 'A test product',
      active: true,
      metadata: {},
      created: Date.now(),
      updated: Date.now(),
    };

    it('should list products using catalog.list()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockProduct], hasMore: false }),
      });

      const result = await client.catalog.list();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8488/catalog/v1/products',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should list products with filters using catalog.list()', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], hasMore: false }),
      });

      await client.catalog.list({
        active: true,
        limit: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8488/catalog/v1/products?active=true&limit=10',
        expect.any(Object),
      );
    });
  });

  describe('products', () => {
    const mockProduct: Product = {
      id: 'prod_123',
      object: 'product',
      name: 'Test Product',
      description: 'A test product',
      active: true,
      metadata: {},
      created: Date.now(),
      updated: Date.now(),
      accessUrl: '/api/products/prod_123',
    };

    describe('create', () => {
      it('should create a product', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockProduct),
        });

        const result = await client.catalog.products.create({
          name: 'Test Product',
          description: 'A test product',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/products',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'Test Product', description: 'A test product' }),
          }),
        );
        expect(result).toEqual(mockProduct);
      });

      it('should create product with metadata', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...mockProduct, metadata: { key: 'value' } }),
        });

        await client.catalog.products.create({
          name: 'Test',
          metadata: { key: 'value' },
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ name: 'Test', metadata: { key: 'value' } }),
          }),
        );
      });
    });

    describe('retrieve', () => {
      it('should retrieve a product by ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockProduct),
        });

        const result = await client.catalog.products.retrieve('prod_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/products/prod_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockProduct);
      });
    });

    describe('list', () => {
      it('should list all products', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockProduct], hasMore: false }),
        });

        const result = await client.catalog.products.list();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/products',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result.data).toHaveLength(1);
        expect(result.hasMore).toBe(false);
      });

      it('should list products with filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [], hasMore: false }),
        });

        await client.catalog.products.list({
          active: true,
          limit: 10,
          startingAfter: 'prod_abc',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/products?active=true&limit=10&startingAfter=prod_abc',
          expect.any(Object),
        );
      });
    });

    describe('update', () => {
      it('should update a product', async () => {
        const updatedProduct = { ...mockProduct, name: 'Updated Product' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(updatedProduct),
        });

        const result = await client.catalog.products.update('prod_123', {
          name: 'Updated Product',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/products/prod_123',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ name: 'Updated Product' }),
          }),
        );
        expect(result.name).toBe('Updated Product');
      });
    });

    describe('delete', () => {
      it('should delete a product', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ deleted: true }),
        });

        const result = await client.catalog.products.delete('prod_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/products/prod_123',
          expect.objectContaining({ method: 'DELETE' }),
        );
        expect(result.deleted).toBe(true);
      });
    });
  });

  describe('prices', () => {
    const mockPrice: Price = {
      id: 'price_123',
      object: 'price',
      product: 'prod_123',
      currency: 'USDC',
      amount: 1000,
      type: 'one_time',
      active: true,
      created: Date.now(),
    };

    describe('create', () => {
      it('should create a one-time price', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPrice),
        });

        const result = await client.catalog.prices.create({
          product: 'prod_123',
          currency: 'USDC',
          amount: 1000,
          type: 'one_time',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/prices',
          expect.objectContaining({
            method: 'POST',
          }),
        );
        expect(result).toEqual(mockPrice);
      });

      it('should create a recurring price', async () => {
        const recurringPrice: Price = {
          ...mockPrice,
          type: 'recurring',
          recurring: { interval: 'month', intervalCount: 1 },
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(recurringPrice),
        });

        await client.catalog.prices.create({
          product: 'prod_123',
          currency: 'USDC',
          amount: 1000,
          type: 'recurring',
          recurring: { interval: 'month', intervalCount: 1 },
        });

        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('retrieve', () => {
      it('should retrieve a price by ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPrice),
        });

        const result = await client.catalog.prices.retrieve('price_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/prices/price_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockPrice);
      });
    });

    describe('list', () => {
      it('should list all prices', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockPrice], hasMore: false }),
        });

        const result = await client.catalog.prices.list();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/prices',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result.data).toHaveLength(1);
      });

      it('should list prices with filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [], hasMore: false }),
        });

        await client.catalog.prices.list({
          product: 'prod_123',
          active: true,
          limit: 5,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/catalog/v1/prices?product=prod_123&active=true&limit=5',
          expect.any(Object),
        );
      });
    });
  });
});
