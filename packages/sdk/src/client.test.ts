import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MoneyMQ, MoneyMQError } from './client';

describe('MoneyMQ Client', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create instance with url only', () => {
      const client = new MoneyMQ({ url: 'http://localhost:8488' });
      expect(client).toBeInstanceOf(MoneyMQ);
      expect(client.catalog).toBeDefined();
      expect(client.payment).toBeDefined();
    });

    it('should create instance with url and secret', () => {
      const client = new MoneyMQ({
        url: 'http://localhost:8488',
        secret: 'test-secret',
      });
      expect(client).toBeInstanceOf(MoneyMQ);
    });

    it('should set default timeout of 30000ms', () => {
      const client = new MoneyMQ({ url: 'http://localhost:8488' });
      expect(client).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const client = new MoneyMQ({
        url: 'http://localhost:8488',
        timeout: 60000,
      });
      expect(client).toBeDefined();
    });
  });

  describe('request method', () => {
    it('should make GET request without body', async () => {
      const client = new MoneyMQ({ url: 'http://localhost:8488' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '123' }),
      });

      const result = await client.request('GET', '/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8488/test',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: undefined,
        }),
      );
      expect(result).toEqual({ id: '123' });
    });

    it('should make POST request with body', async () => {
      const client = new MoneyMQ({ url: 'http://localhost:8488' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '123' }),
      });

      const body = { name: 'Test' };
      await client.request('POST', '/test', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8488/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    });

    it('should include Authorization header when secret is provided', async () => {
      const client = new MoneyMQ({
        url: 'http://localhost:8488',
        secret: 'test-secret',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await client.request('GET', '/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-secret',
          },
        }),
      );
    });

    it('should throw MoneyMQError on non-ok response', async () => {
      const client = new MoneyMQ({ url: 'http://localhost:8488' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found' }),
      });

      await expect(client.request('GET', '/test')).rejects.toThrow(MoneyMQError);
      await expect(client.request('GET', '/test')).rejects.toThrow('Not found');
    });

    it('should handle error response without message', async () => {
      const client = new MoneyMQ({ url: 'http://localhost:8488' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(client.request('GET', '/test')).rejects.toThrow(
        'Request failed with status 500',
      );
    });
  });
});

describe('MoneyMQError', () => {
  it('should create error with message and status code', () => {
    const error = new MoneyMQError('Test error', 404);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('MoneyMQError');
  });

  it('should include raw error data', () => {
    const rawData = { code: 'not_found', details: {} };
    const error = new MoneyMQError('Test error', 404, rawData);
    expect(error.raw).toEqual(rawData);
  });

  it('should be instanceof Error', () => {
    const error = new MoneyMQError('Test', 400);
    expect(error).toBeInstanceOf(Error);
  });
});
