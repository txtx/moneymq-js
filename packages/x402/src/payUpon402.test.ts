import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { payUpon402 } from './payUpon402';

// Mock the x402/client module
vi.mock('x402/client', () => ({
  createPaymentHeader: vi.fn().mockResolvedValue('mock_payment_header'),
  selectPaymentRequirements: vi.fn((accepts) => accepts[0]),
}));

describe('payUpon402', () => {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  describe('successful requests', () => {
    it('should return result for successful promise', async () => {
      const result = await payUpon402(Promise.resolve({ data: 'success' }));

      expect(result).toEqual({ data: 'success' });
    });

    it('should return result for successful function', async () => {
      const fn = vi.fn().mockResolvedValue({ data: 'success' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'success' });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-402 errors', () => {
    it('should re-throw non-402 errors from promise', async () => {
      const error = new Error('Network error');

      await expect(payUpon402(Promise.reject(error))).rejects.toThrow('Network error');
    });

    it('should re-throw non-402 errors from function', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Server error'));

      await expect(payUpon402(fn)).rejects.toThrow('Server error');
    });

    it('should re-throw 404 errors', async () => {
      const error = { statusCode: 404, message: 'Not found' };

      await expect(payUpon402(Promise.reject(error))).rejects.toEqual(error);
    });

    it('should re-throw 500 errors', async () => {
      const error = { statusCode: 500, message: 'Internal server error' };

      await expect(payUpon402(Promise.reject(error))).rejects.toEqual(error);
    });
  });

  describe('402 error handling', () => {
    it('should detect 402 from statusCode property', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'success' });

      const result = await payUpon402(fn);

      expect(console.log).toHaveBeenCalledWith('💳 402 Payment Required - processing payment...');
      expect(result).toEqual({ data: 'success' });
    });

    it('should detect 402 from status property', async () => {
      const error = {
        status: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'success' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'success' });
    });

    it('should detect 402 from raw.statusCode', async () => {
      const error = {
        raw: {
          statusCode: 402,
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'success' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'success' });
    });

    it('should warn when using promise instead of function for 402', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [{ scheme: 'exact', network: 'solana', maxAmountRequired: '100' }],
        },
      };

      await expect(payUpon402(Promise.reject(error))).rejects.toEqual(error);

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Cannot retry - promise already executed. Use () => syntax for retry support.',
      );
    });

    it('should warn when no wallet client is provided', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'success' });

      await payUpon402(fn);

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  No wallet client provided. Using mock payment (will not actually pay).',
      );
    });
  });

  describe('payment requirements parsing', () => {
    it('should parse Stripe SDK error format', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
          code: 'payment_required',
          message: 'Payment required',
          type: 'invalid_request_error',
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      const result = await payUpon402(fn);

      expect(console.log).toHaveBeenCalledWith(
        '✓ Found payment requirements in Stripe error format',
      );
      expect(result).toEqual({ data: 'paid' });
    });

    it('should parse error.raw.body string format', async () => {
      const requirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'solana',
            maxAmountRequired: '100',
            payTo: 'wallet123',
          },
        ],
      };

      const error = {
        statusCode: 402,
        raw: {
          body: JSON.stringify(requirements),
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'paid' });
    });

    it('should parse error.raw.body object format', async () => {
      const error = {
        statusCode: 402,
        raw: {
          body: {
            x402Version: 1,
            accepts: [
              {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: '100',
                payTo: 'wallet123',
              },
            ],
          },
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'paid' });
    });

    it('should parse error.response.data format (axios)', async () => {
      const error = {
        statusCode: 402,
        response: {
          data: {
            x402Version: 1,
            accepts: [
              {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: '100',
                payTo: 'wallet123',
              },
            ],
          },
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'paid' });
    });

    it('should parse error.error format', async () => {
      const error = {
        statusCode: 402,
        error: {
          x402Version: 1,
          accepts: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      const result = await payUpon402(fn);

      expect(result).toEqual({ data: 'paid' });
    });

    it('should throw when no payment requirements found', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [],
        },
      };

      const fn = vi.fn().mockRejectedValue(error);

      await expect(payUpon402(fn)).rejects.toEqual(error);

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  No payment requirements found in 402 response',
      );
    });

    it('should throw when cannot parse response', async () => {
      const error = {
        statusCode: 402,
        // No parseable payment requirements
      };

      const fn = vi.fn().mockRejectedValue(error);

      await expect(payUpon402(fn)).rejects.toEqual(error);

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Failed to parse payment requirements from 402 response',
      );
    });
  });

  describe('retry behavior', () => {
    it('should retry the function after creating payment header', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'paid content' });

      const result = await payUpon402(fn);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: 'paid content' });
      expect(console.log).toHaveBeenCalledWith('✅ Payment header created, retrying request...');
    });

    it('should create mock payment header when no wallet client', async () => {
      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'success' });

      await payUpon402(fn);

      expect(console.log).toHaveBeenCalledWith('💰 Creating mock payment header...');
    });
  });

  describe('with wallet client', () => {
    it('should create payment using wallet client', async () => {
      const { createPaymentHeader } = await import('x402/client');

      const mockWalletClient = {
        signTransaction: vi.fn(),
      };

      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      const result = await payUpon402(fn, mockWalletClient as any);

      expect(createPaymentHeader).toHaveBeenCalled();
      expect(result).toEqual({ data: 'paid' });
    });

    it('should throw when payment amount exceeds maxValue', async () => {
      const mockWalletClient = {
        signTransaction: vi.fn(),
      };

      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '1000000000', // 1000 USDC - exceeds default maxValue
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValue(error);

      // maxValue defaults to 0.1 * 10^6 = 100000
      await expect(payUpon402(fn, mockWalletClient as any)).rejects.toEqual(error);

      expect(console.warn).toHaveBeenCalledWith('⚠️  Payment creation failed');
    });

    it('should respect custom maxValue', async () => {
      const mockWalletClient = {
        signTransaction: vi.fn(),
      };

      const error = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '500000', // 0.5 USDC
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ data: 'paid' });

      // Set maxValue to 1 USDC (1000000)
      const result = await payUpon402(fn, mockWalletClient as any, BigInt(1000000));

      expect(result).toEqual({ data: 'paid' });
    });
  });

  describe('payment errors', () => {
    it('should re-throw original error when payment creation fails', async () => {
      const { createPaymentHeader } = await import('x402/client');
      (createPaymentHeader as any).mockRejectedValueOnce(new Error('Wallet error'));

      const mockWalletClient = {
        signTransaction: vi.fn(),
      };

      const originalError = {
        statusCode: 402,
        raw: {
          payment_requirements: [
            {
              scheme: 'exact',
              network: 'solana',
              maxAmountRequired: '100',
              payTo: 'wallet123',
            },
          ],
        },
      };

      const fn = vi.fn().mockRejectedValue(originalError);

      await expect(payUpon402(fn, mockWalletClient as any)).rejects.toEqual(originalError);

      expect(console.warn).toHaveBeenCalledWith('⚠️  Payment creation failed');
    });
  });
});
