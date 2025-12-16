// Main exports
export { payUpon402 } from './payUpon402';
export { createStripeClient } from './createStripeClient';
export { createX402Handler, requirePayment } from './middleware';

// Re-export x402 utilities for convenience
export { createSigner } from 'x402-fetch';
export { createPaymentHeader, selectPaymentRequirements } from 'x402/client';
export type { PaymentRequirements, Signer, MultiNetworkSigner, X402Config } from 'x402/types';
