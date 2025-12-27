export { MoneyMQ } from './client';
export type { MoneyMQConfig } from './client';

// Config utilities
export { fetchConfig, getRpcUrl } from './config';
export type { ServerConfig } from './config';

// Catalog types
export type {
  Product,
  ProductCreateParams,
  ProductListParams,
  Price,
  PriceCreateParams,
  PaymentRequirements,
  ProductAccessResponse,
  ProductAccessParams,
} from './catalog';

// Catalog errors
export { PaymentRequiredError } from './catalog';

// Payment types
export type {
  CheckoutSession,
  CheckoutCreateParams,
  PaymentLink,
  PaymentLinkCreateParams,
  Payment,
  PaymentListParams,
  Customer,
  CustomerCreateParams,
  CustomerUpdateParams,
  Payout,
  PayoutCreateParams,
  PayoutListParams,
  PayoutSettings,
  PayoutSettingsUpdateParams,
  // Simple payment types
  PayParams,
  PayResult,
  // Payment intent types
  PaymentIntent,
  PaymentIntentCreateParams,
} from './payment';

// X402 types
export type {
  GetSignerParams,
  Signer,
  X402ClientConfig,
} from './x402';

// Events (SSE)
export {
  EventStream,
  createEventStream,
  isPaymentVerificationSucceeded,
  isPaymentVerificationFailed,
  isPaymentSettlementSucceeded,
  isPaymentSettlementFailed,
  parseCloudEvent,
  buildEventStreamUrl,
} from './events';

export type {
  CloudEventEnvelope,
  PaymentFlow,
  PaymentVerificationSucceededData,
  PaymentVerificationFailedData,
  PaymentSettlementSucceededData,
  PaymentSettlementFailedData,
  MoneyMQEventType,
  MoneyMQEventMap,
  PaymentVerificationEvent,
  PaymentSettlementEvent,
  PaymentEvent,
  EventStreamOptions,
  EventStreamState,
  EventHandler,
  ErrorHandler,
  StateHandler,
} from './events';
