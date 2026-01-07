/**
 * CheckoutReceipt - Wrapper for JWT payment receipts
 *
 * Provides a type-safe interface to access receipt data with helper methods.
 *
 * @example
 * ```typescript
 * const receipt = new CheckoutReceipt(jwtToken);
 *
 * // Access basket items
 * const basket = receipt.getBasket();
 * console.log(basket[0].productId, basket[0].features);
 *
 * // Access payment details
 * const payment = receipt.getPayment();
 * console.log(payment.payer, payment.amount, payment.currency);
 *
 * // Access processor attachments (e.g., S3 credentials, surfnet info)
 * const processor = receipt.getProcessorData();
 * if (processor?.snapshot) {
 *   // Use S3 credentials
 *   console.log(processor.snapshot.bucket, processor.snapshot.keyPrefix);
 * }
 * if (processor?.surfnet) {
 *   // Use surfnet info
 *   console.log(processor.surfnet.rpcUrl, processor.surfnet.subdomain);
 * }
 *
 * // Get raw JWT for verification
 * const jwt = receipt.token;
 * ```
 */

/** Basket item representing a purchased product */
export interface BasketItem {
  /** Product ID */
  productId: string;
  /** Product features (capabilities and limits purchased) */
  features: Record<string, unknown> | unknown[];
  /** Quantity purchased */
  quantity: number;
}

/** Payment details from the receipt */
export interface PaymentDetails {
  /** Payer's public key/address */
  payer: string;
  /** Transaction ID (deterministic hash of the payment) */
  transactionId: string;
  /** Payment amount (as string to preserve precision) */
  amount: string;
  /** Currency code (e.g., "USDC") */
  currency: string;
  /** Network (e.g., "solana") */
  network: string;
  /** On-chain transaction signature */
  signature?: string;
}

/** Processor-provided data structure */
export interface ProcessorData {
  /** Service name (e.g., "surfnet") */
  service?: string;
  /** Fulfillment status */
  status?: 'fulfilled' | 'partial';
  /** S3 upload credentials */
  snapshot?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    bucket: string;
    keyPrefix: string;
    expiresAt: string;
  };
  /** Surfnet information */
  surfnet?: {
    rpcUrl: string;
    subdomain: string;
    domain: string;
    networkId: string;
  };
  /** Additional processor-specific data */
  [key: string]: unknown;
}

/** Attachments containing processor-provided data */
export interface Attachments {
  /** Processor-provided data (e.g., S3 credentials, surfnet info) */
  processor?: ProcessorData;
}

/** JWT claims structure for payment receipts */
export interface ReceiptClaims {
  /** Basket items (products purchased) */
  basket: BasketItem[];
  /** Payment details */
  payment: PaymentDetails;
  /** Attachments from processors and other services */
  attachments?: Attachments;
  /** JWT issued at timestamp (Unix seconds) */
  iat: number;
  /** JWT expiration timestamp (Unix seconds) */
  exp: number;
  /** Issuer (MoneyMQ payment stack ID) */
  iss: string;
  /** Subject (transaction_id) */
  sub: string;
}

/**
 * Decode a JWT token without verification
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
function decodeJwt<T>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    // Handle URL-safe base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

/**
 * CheckoutReceipt wraps a JWT payment receipt token and provides
 * convenient accessor methods for the receipt data.
 */
export class CheckoutReceipt {
  /** The raw JWT token string */
  readonly token: string;

  /** Decoded claims from the JWT */
  private readonly claims: ReceiptClaims;

  /**
   * Create a new CheckoutReceipt from a JWT token
   * @param token - JWT token string from payment completion
   * @throws Error if token is invalid or cannot be decoded
   */
  constructor(token: string) {
    this.token = token;

    const claims = decodeJwt<ReceiptClaims>(token);
    if (!claims) {
      throw new Error('Invalid receipt token: could not decode JWT');
    }

    this.claims = claims;
  }

  /**
   * Get the basket items (products purchased)
   * @returns Array of basket items with productId, features, and quantity
   */
  getBasket(): BasketItem[] {
    return this.claims.basket || [];
  }

  /**
   * Get the payment details
   * @returns Payment information including payer, amount, currency, network
   */
  getPayment(): PaymentDetails {
    return this.claims.payment;
  }

  /**
   * Get the attachments (processor-provided data)
   * @returns Attachments object or undefined if no attachments
   */
  getAttachments(): Attachments | undefined {
    return this.claims.attachments;
  }

  /**
   * Get the processor attachment data directly
   * @returns Processor data or undefined if not present
   */
  getProcessorData(): ProcessorData | undefined {
    return this.claims.attachments?.processor;
  }

  /**
   * Get the transaction ID
   * @returns Transaction ID string
   */
  getTransactionId(): string {
    return this.claims.payment.transactionId;
  }

  /**
   * Get the payer address
   * @returns Payer's public key/address
   */
  getPayer(): string {
    return this.claims.payment.payer;
  }

  /**
   * Check if the receipt has expired
   * @returns true if the receipt has expired
   */
  isExpired(): boolean {
    return Date.now() / 1000 > this.claims.exp;
  }

  /**
   * Get the expiration date
   * @returns Date when the receipt expires
   */
  getExpirationDate(): Date {
    return new Date(this.claims.exp * 1000);
  }

  /**
   * Get the issuance date
   * @returns Date when the receipt was issued
   */
  getIssuedDate(): Date {
    return new Date(this.claims.iat * 1000);
  }

  /**
   * Get the issuer (payment stack ID)
   * @returns Issuer identifier
   */
  getIssuer(): string {
    return this.claims.iss;
  }

  /**
   * Get the raw claims object
   * @returns Full JWT claims
   */
  getClaims(): ReceiptClaims {
    return this.claims;
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): { token: string; claims: ReceiptClaims } {
    return {
      token: this.token,
      claims: this.claims,
    };
  }
}
