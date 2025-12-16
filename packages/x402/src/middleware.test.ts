import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createX402Handler, requirePayment } from './middleware';

describe('createX402Handler', () => {
  let mockReq: { headers: Record<string, string | undefined>; method?: string; path?: string };
  let mockRes: {
    status: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('without payment header', () => {
    it('should return 402 Payment Required', async () => {
      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: '0x1234567890abcdef',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(402);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'payment_required',
            message: 'Payment required to access this resource',
          }),
        }),
      );
    });

    it('should set X-Payment-Requirements header', async () => {
      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: '0x1234567890abcdef',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Payment-Requirements',
        expect.stringContaining('0x1234567890abcdef'),
      );
    });

    it('should include payment requirements in response body', async () => {
      const handler = createX402Handler({
        price: 500,
        currency: 'USDC',
        recipient: 'wallet123',
        network: 'solana-mainnet',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_requirements: expect.arrayContaining([
            expect.objectContaining({
              scheme: 'exact',
              network: 'solana-mainnet',
              maxAmountRequired: '500',
              payTo: 'wallet123',
              asset: 'USDC',
            }),
          ]),
        }),
      );
    });

    it('should use default network when not specified', async () => {
      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_requirements: expect.arrayContaining([
            expect.objectContaining({
              network: 'solana',
            }),
          ]),
        }),
      );
    });

    it('should not call next()', async () => {
      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('with valid payment header', () => {
    it('should call next() when payment is valid', async () => {
      const validPayment = {
        payload: {
          transaction: 'valid_tx_signature',
          payer: 'payer_wallet_address',
        },
      };
      const paymentHeader = Buffer.from(JSON.stringify(validPayment)).toString('base64');

      mockReq.headers['x-payment'] = paymentHeader;

      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should call onPayment callback when provided', async () => {
      const onPayment = vi.fn();
      const validPayment = {
        payload: {
          transaction: 'tx_sig_123',
          payer: 'payer_address',
        },
      };
      const paymentHeader = Buffer.from(JSON.stringify(validPayment)).toString('base64');

      mockReq.headers['x-payment'] = paymentHeader;

      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
        onPayment,
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(onPayment).toHaveBeenCalledWith({
        amount: 100,
        payer: 'payer_address',
        signature: 'tx_sig_123',
      });
    });

    it('should await async onPayment callback', async () => {
      const callOrder: string[] = [];
      const onPayment = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push('onPayment');
      });
      mockNext.mockImplementation(() => {
        callOrder.push('next');
      });

      const validPayment = {
        payload: {
          transaction: 'tx_sig',
          payer: 'payer',
        },
      };
      mockReq.headers['x-payment'] = Buffer.from(JSON.stringify(validPayment)).toString('base64');

      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
        onPayment,
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(callOrder).toEqual(['onPayment', 'next']);
    });
  });

  describe('with invalid payment header', () => {
    it('should return 402 for malformed header', async () => {
      mockReq.headers['x-payment'] = 'not-valid-base64!!!';

      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(402);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'invalid_payment',
          }),
        }),
      );
    });

    it('should return 402 for missing transaction', async () => {
      const invalidPayment = {
        payload: {
          payer: 'payer_address',
          // no transaction
        },
      };
      mockReq.headers['x-payment'] = Buffer.from(JSON.stringify(invalidPayment)).toString('base64');

      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(402);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'invalid_payment',
          }),
        }),
      );
    });

    it('should not call next() for invalid payment', async () => {
      mockReq.headers['x-payment'] = 'invalid';

      const handler = createX402Handler({
        price: 100,
        currency: 'USDC',
        recipient: 'wallet123',
      });

      await handler(mockReq as any, mockRes as any, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe('requirePayment', () => {
  it('should throw error when recipient is not provided', () => {
    expect(() =>
      requirePayment({
        amount: 100,
        currency: 'USDC',
      }),
    ).toThrow('requirePayment: recipient wallet address is required');
  });

  it('should return a middleware function when recipient is provided', () => {
    const middleware = requirePayment({
      amount: 100,
      currency: 'USDC',
      recipient: 'wallet123',
    });

    expect(typeof middleware).toBe('function');
  });

  it('should create handler with correct configuration', async () => {
    const mockReq = { headers: {} };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      json: vi.fn(),
    };
    const mockNext = vi.fn();

    const middleware = requirePayment({
      amount: 250,
      currency: 'USDC',
      recipient: 'my_wallet',
      network: 'solana-devnet',
    });

    await middleware(mockReq as any, mockRes as any, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_requirements: expect.arrayContaining([
          expect.objectContaining({
            maxAmountRequired: '250',
            asset: 'USDC',
            payTo: 'my_wallet',
            network: 'solana-devnet',
          }),
        ]),
      }),
    );
  });
});
