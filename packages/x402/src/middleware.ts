import type { PaymentRequirements } from 'x402/types';

/**
 * Configuration for x402 handler
 */
export interface X402HandlerConfig {
  /** Price in smallest unit (e.g., 100 = 0.0001 USDC) */
  price: number;
  /** Currency code */
  currency: string;
  /** Recipient wallet address */
  recipient: string;
  /** Network (defaults to 'solana-mainnet') */
  network?: string;
  /** Callback when payment is received */
  onPayment?: (payment: {
    amount: number;
    payer: string;
    signature?: string;
  }) => void | Promise<void>;
}

/**
 * Express-compatible request type
 */
interface Request {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
}

/**
 * Express-compatible response type
 */
interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

/**
 * Express-compatible next function
 */
type NextFunction = (err?: unknown) => void;

/**
 * Create payment requirements for 402 response
 */
function createPaymentRequirements(config: X402HandlerConfig): PaymentRequirements {
  return {
    scheme: 'exact',
    network: (config.network ?? 'solana') as PaymentRequirements['network'],
    maxAmountRequired: String(config.price),
    resource: config.recipient,
    description: `Payment of ${config.price} ${config.currency}`,
    mimeType: 'application/json',
    payTo: config.recipient,
    maxTimeoutSeconds: 60,
    asset: config.currency,
    extra: {},
  };
}

/**
 * Verify x402 payment header
 */
async function verifyPaymentHeader(
  header: string,
  _config: X402HandlerConfig,
): Promise<{ valid: boolean; payer?: string; signature?: string }> {
  try {
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));

    // Basic validation - in production, verify the actual transaction
    if (!decoded.payload?.transaction) {
      return { valid: false };
    }

    // TODO: Implement actual transaction verification
    // For now, accept any properly formatted header
    return {
      valid: true,
      payer: decoded.payload?.payer ?? 'unknown',
      signature: decoded.payload?.transaction,
    };
  } catch {
    return { valid: false };
  }
}

/**
 * Create an Express middleware handler for x402 payments
 *
 * @example
 * ```typescript
 * import { createX402Handler } from '@moneymq/x402';
 *
 * app.use('/api/protected', createX402Handler({
 *   price: 100, // 0.0001 USDC
 *   currency: 'USDC',
 *   recipient: 'YourWalletAddress...',
 *   onPayment: async (payment) => {
 *     console.log(`Received payment from ${payment.payer}`);
 *   },
 * }));
 * ```
 */
export function createX402Handler(config: X402HandlerConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers['x-payment'] as string | undefined;

    if (!paymentHeader) {
      // Return 402 Payment Required
      const requirements = createPaymentRequirements(config);

      res.status(402);
      res.setHeader('X-Payment-Requirements', JSON.stringify([requirements]));
      res.json({
        error: {
          code: 'payment_required',
          message: 'Payment required to access this resource',
          type: 'invalid_request_error',
        },
        payment_requirements: [requirements],
      });
      return;
    }

    // Verify payment
    const verification = await verifyPaymentHeader(paymentHeader, config);

    if (!verification.valid) {
      res.status(402);
      res.json({
        error: {
          code: 'invalid_payment',
          message: 'Invalid payment header',
          type: 'invalid_request_error',
        },
      });
      return;
    }

    // Payment verified - call onPayment callback if provided
    if (config.onPayment) {
      await config.onPayment({
        amount: config.price,
        payer: verification.payer!,
        signature: verification.signature,
      });
    }

    // Continue to next handler
    next();
  };
}

/**
 * Shorthand middleware for requiring payment on a route
 *
 * @example
 * ```typescript
 * import { requirePayment } from '@moneymq/x402';
 *
 * app.get('/api/premium',
 *   requirePayment({ amount: 50, currency: 'USDC' }),
 *   (req, res) => {
 *     res.json({ data: 'Premium content' });
 *   }
 * );
 * ```
 */
export function requirePayment(options: {
  amount: number;
  currency: string;
  recipient?: string;
  network?: string;
}) {
  if (!options.recipient) {
    throw new Error('requirePayment: recipient wallet address is required');
  }

  return createX402Handler({
    price: options.amount,
    currency: options.currency,
    recipient: options.recipient,
    network: options.network,
  });
}
