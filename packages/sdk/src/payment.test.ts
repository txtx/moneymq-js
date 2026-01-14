import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MoneyMQ } from './client';
import type { CheckoutSession, PaymentLink, Customer, Payment, Payout } from './payment';

describe('PaymentAPI', () => {
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

  describe('checkout', () => {
    const mockSession: CheckoutSession = {
      id: 'cs_123',
      object: 'checkout.session',
      url: 'https://checkout.moneymq.com/cs_123',
      status: 'open',
      paymentStatus: 'unpaid',
      lineItems: [{ productId: 'prod_123', quantity: 1 }],
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: Date.now() + 3600000,
      created: Date.now(),
    };

    describe('create', () => {
      it('should create a checkout session', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSession),
        });

        const result = await client.payment.checkout.create({
          lineItems: [{ productId: 'prod_123', quantity: 1 }],
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/checkout',
          expect.objectContaining({
            method: 'POST',
          }),
        );
        expect(result).toEqual(mockSession);
      });

      it('should create checkout with customer', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...mockSession, customer: 'cus_123' }),
        });

        await client.payment.checkout.create({
          lineItems: [{ productId: 'prod_123', quantity: 1 }],
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
          customer: 'cus_123',
        });

        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('retrieve', () => {
      it('should retrieve a checkout session', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSession),
        });

        const result = await client.payment.checkout.retrieve('cs_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/checkout/cs_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockSession);
      });
    });
  });

  describe('links', () => {
    const mockLink: PaymentLink = {
      id: 'plink_123',
      object: 'payment_link',
      url: 'https://pay.moneymq.com/plink_123',
      active: true,
      lineItems: [{ productId: 'prod_123', quantity: 1 }],
      created: Date.now(),
    };

    describe('create', () => {
      it('should create a payment link', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockLink),
        });

        const result = await client.payment.links.create({
          lineItems: [{ productId: 'prod_123', quantity: 1 }],
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/links',
          expect.objectContaining({ method: 'POST' }),
        );
        expect(result).toEqual(mockLink);
      });

      it('should create link with Date expiresAt', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockLink),
        });

        const expiresAt = new Date('2025-12-31');
        await client.payment.links.create({
          lineItems: [{ productId: 'prod_123', quantity: 1 }],
          expiresAt,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining(String(expiresAt.getTime())),
          }),
        );
      });

      it('should create link with number expiresAt', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockLink),
        });

        await client.payment.links.create({
          lineItems: [{ productId: 'prod_123', quantity: 1 }],
          expiresAt: 1735689600000,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('1735689600000'),
          }),
        );
      });
    });

    describe('retrieve', () => {
      it('should retrieve a payment link', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockLink),
        });

        const result = await client.payment.links.retrieve('plink_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/links/plink_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockLink);
      });
    });

    describe('deactivate', () => {
      it('should deactivate a payment link', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...mockLink, active: false }),
        });

        const result = await client.payment.links.deactivate('plink_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/links/plink_123',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ active: false }),
          }),
        );
        expect(result.active).toBe(false);
      });
    });
  });

  describe('customers', () => {
    const mockCustomer: Customer = {
      id: 'cus_123',
      object: 'customer',
      email: 'test@example.com',
      name: 'Test User',
      created: Date.now(),
    };

    describe('create', () => {
      it('should create a customer', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCustomer),
        });

        const result = await client.payment.customers.create({
          email: 'test@example.com',
          name: 'Test User',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/customers',
          expect.objectContaining({ method: 'POST' }),
        );
        expect(result).toEqual(mockCustomer);
      });
    });

    describe('retrieve', () => {
      it('should retrieve a customer', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCustomer),
        });

        const result = await client.payment.customers.retrieve('cus_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/customers/cus_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockCustomer);
      });

      it('should retrieve customer with expand', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...mockCustomer, payments: [] }),
        });

        await client.payment.customers.retrieve('cus_123', { expand: ['payments'] });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/customers/cus_123?expand=payments',
          expect.any(Object),
        );
      });
    });

    describe('update', () => {
      it('should update a customer', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...mockCustomer, name: 'Updated Name' }),
        });

        const result = await client.payment.customers.update('cus_123', {
          name: 'Updated Name',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/customers/cus_123',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ name: 'Updated Name' }),
          }),
        );
        expect(result.name).toBe('Updated Name');
      });
    });

    describe('list', () => {
      it('should list customers', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockCustomer], hasMore: false }),
        });

        const result = await client.payment.customers.list();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/customers',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result.data).toHaveLength(1);
      });

      it('should list customers with filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [], hasMore: false }),
        });

        await client.payment.customers.list({
          email: 'test@example.com',
          limit: 10,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/customers?email=test%40example.com&limit=10',
          expect.any(Object),
        );
      });
    });
  });

  describe('payouts', () => {
    const mockPayout: Payout = {
      id: 'po_123',
      object: 'payout',
      amount: 10000,
      currency: 'USDC',
      status: 'completed',
      destination: '0x123...',
      created: Date.now(),
    };

    describe('create', () => {
      it('should create a payout', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPayout),
        });

        const result = await client.payment.payouts.create({
          amount: 10000,
          currency: 'USDC',
          destination: '0x123...',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/payouts',
          expect.objectContaining({ method: 'POST' }),
        );
        expect(result).toEqual(mockPayout);
      });
    });

    describe('retrieve', () => {
      it('should retrieve a payout', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPayout),
        });

        const result = await client.payment.payouts.retrieve('po_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/payouts/po_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockPayout);
      });
    });

    describe('list', () => {
      it('should list payouts', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockPayout], hasMore: false }),
        });

        const result = await client.payment.payouts.list();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/payouts',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result.data).toHaveLength(1);
      });

      it('should list payouts with filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [], hasMore: false }),
        });

        await client.payment.payouts.list({
          status: 'pending',
          limit: 5,
          startingAfter: 'po_abc',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/payouts?status=pending&limit=5&starting_after=po_abc',
          expect.any(Object),
        );
      });
    });

    describe('settings', () => {
      it('should retrieve payout settings', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              destination: { type: 'wallet', address: '0x...', currency: 'USDC' },
              schedule: 'instant',
            }),
        });

        const result = await client.payment.payouts.settings.retrieve();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/payouts/settings',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result.schedule).toBe('instant');
      });

      it('should update payout settings', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              destination: { type: 'wallet', address: '0x...', currency: 'USDC' },
              schedule: 'daily',
            }),
        });

        const result = await client.payment.payouts.settings.update({
          schedule: 'daily',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/payouts/settings',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ schedule: 'daily' }),
          }),
        );
        expect(result.schedule).toBe('daily');
      });
    });
  });

  describe('payments', () => {
    const mockPayment: Payment = {
      id: 'pay_123',
      object: 'payment',
      amount: 1000,
      currency: 'USDC',
      status: 'completed',
      created: Date.now(),
    };

    describe('retrieve', () => {
      it('should retrieve a payment', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPayment),
        });

        const result = await client.payment.retrieve('pay_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1/pay_123',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result).toEqual(mockPayment);
      });
    });

    describe('list', () => {
      it('should list payments', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [mockPayment], hasMore: false }),
        });

        const result = await client.payment.list();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(result.data).toHaveLength(1);
      });

      it('should list payments with filters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [], hasMore: false }),
        });

        await client.payment.list({
          customerId: 'cus_123',
          status: 'completed',
          limit: 10,
          startingAfter: 'pay_abc',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8488/payment/v1?customer=cus_123&status=completed&limit=10&starting_after=pay_abc',
          expect.any(Object),
        );
      });
    });
  });

  describe('webhooks', () => {
    it('should trigger a test webhook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await client.payment.webhooks.trigger('payment.completed', {
        paymentId: 'pay_123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8488/payment/v1/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            event: 'payment.completed',
            data: { paymentId: 'pay_123' },
          }),
        }),
      );
      expect(result.success).toBe(true);
    });
  });
});
