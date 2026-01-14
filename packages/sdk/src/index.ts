export { MoneyMQ } from './client';
export type { MoneyMQConfig } from './client';

// Config utilities
export { fetchPaymentConfig, getRpcUrl } from './config';
export type { PaymentConfig } from './config';

// Legacy config (deprecated)
export { fetchConfig } from './config';
export type { ServerConfig } from './config';

// Catalog types
export type {
  Product,
  ProductPrice,
  ProductFeature,
  ProductCreateParams,
  ProductListParams,
  Price,
  PriceRecurring,
  PriceCreateParams,
  PaymentRequirements,
  ProductAccessResponse,
  ProductAccessParams,
  ExperimentConfig,
} from './catalog';

// Catalog errors
export { PaymentRequiredError } from './catalog';

// Payment types
export type {
  CheckoutLineItem,
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

// Events (SSE) - CloudEvent streaming via DB polling
export {
  EventStream,
  createEventStream,
  isPaymentVerificationSucceeded,
  isPaymentVerificationFailed,
  isPaymentSettlementSucceeded,
  isPaymentSettlementFailed,
  isTransactionCompleted,
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
  TransactionCompletedData,
  MoneyMQEventType,
  MoneyMQEventMap,
  PaymentVerificationEvent,
  PaymentSettlementEvent,
  TransactionCompletedEvent,
  PaymentEvent,
  EventStreamOptions,
  EventStreamState,
  EventHandler,
  ErrorHandler,
  StateHandler,
} from './events';

// Channels (new API) - Reader, PaymentHook, PaymentStream
export {
  EventReader,
  PaymentHook,
  PaymentStream,
  ChannelError,
  createEventReader,
  createPaymentHook,
  createPaymentStream,
} from './channels';

export type {
  ChannelEvent,
  ConnectionState,
  ChannelEventHandler,
  ConnectionHandler,
  ChannelErrorHandler,
  ReaderOptions,
  PaymentHookOptions,
  PaymentStreamOptions,
  Transaction,
  TransactionWithHook,
  TransactionHandler,
  // Stream message types (for async iteration)
  EventStreamMessage,
  StateStreamMessage,
  ErrorStreamMessage,
  TransactionStreamMessage,
  ChannelStreamMessage,
  ReceiverStreamMessage,
  StreamOptions,
} from './channels';

// Channel ID utilities
export { computeChannelId } from './channel-id';

// Receipt utilities
export { CheckoutReceipt } from './receipt';
export type {
  BasketItem,
  PaymentDetails,
  ProcessorData,
  Attachments,
  ReceiptClaims,
} from './receipt';
