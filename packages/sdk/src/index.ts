export { MoneyMQ } from './client';
export type { MoneyMQConfig } from './client';

// Config utilities
export { fetchConfig, getRpcUrl } from './config';
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

// Events (SSE) - Legacy API (deprecated, use channels instead)
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

// Channels (new API) - Reader, Actor, Receiver
export {
  EventReader,
  EventActor,
  EventReceiver,
  ChannelError,
  createEventReader,
  createEventActor,
  createEventReceiver,
} from './channels';

export type {
  ChannelEvent,
  ConnectionState,
  ChannelEventHandler,
  ConnectionHandler,
  ChannelErrorHandler,
  ReaderOptions,
  ActorOptions,
  ReceiverOptions,
  Transaction,
  TransactionHandler,
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
