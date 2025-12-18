import type { MoneyMQ } from '@moneymq/sdk';

/**
 * Usage record for billing
 */
export interface UsageRecord {
  id: string;
  userId: string;
  customerId: string;
  metric: string;
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, string>;
  billed: boolean;
  billedAt?: Date;
  paymentId?: string;
}

/**
 * Usage metric configuration
 */
export interface UsageMetric {
  /**
   * Unique identifier for this metric (e.g., "api_calls", "storage_gb")
   */
  name: string;
  /**
   * MoneyMQ price ID for this metric
   */
  priceId: string;
  /**
   * Human-readable display name
   */
  displayName?: string;
  /**
   * Unit of measurement (e.g., "requests", "GB", "minutes")
   */
  unit?: string;
  /**
   * Aggregation method for billing period
   * - 'sum': Total of all records (default)
   * - 'max': Maximum value in period
   * - 'last': Last recorded value
   */
  aggregation?: 'sum' | 'max' | 'last';
}

/**
 * Usage billing configuration
 */
export interface UsageBillingConfig {
  /**
   * Enable usage-based billing
   */
  enabled: boolean;
  /**
   * Available usage metrics
   */
  metrics: UsageMetric[];
  /**
   * Callback after usage is recorded
   */
  onUsageRecorded?: (record: UsageRecord) => void | Promise<void>;
  /**
   * Callback after usage is billed
   */
  onUsageBilled?: (params: {
    records: UsageRecord[];
    paymentId: string;
    amount: number;
  }) => void | Promise<void>;
}

/**
 * MoneyMQ Better Auth plugin options
 */
export interface MoneyMQPluginOptions {
  /**
   * MoneyMQ SDK client instance
   */
  client: MoneyMQ;
  /**
   * Webhook secret for signature verification
   */
  webhookSecret?: string;
  /**
   * Automatically create MoneyMQ customer on user signup
   * @default true
   */
  createCustomerOnSignUp?: boolean;
  /**
   * Callback after customer is created
   */
  onCustomerCreate?: (params: {
    customer: { id: string; email: string };
    user: { id: string; email: string };
  }) => void | Promise<void>;
  /**
   * Customize customer creation parameters
   */
  getCustomerCreateParams?: (user: { id: string; email: string; name?: string }) => {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  };
  /**
   * Handle custom webhook events
   */
  onEvent?: (event: WebhookEvent) => void | Promise<void>;
  /**
   * Usage-based billing configuration
   */
  usage?: UsageBillingConfig;
  /**
   * Schema customization
   */
  schema?: {
    usage?: {
      modelName?: string;
      fields?: Partial<Record<keyof UsageRecord, string>>;
    };
  };
}

/**
 * Webhook event from MoneyMQ
 */
export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  data: Record<string, unknown>;
  created: number;
}

/**
 * Supported webhook event types
 */
export type WebhookEventType =
  | 'payment.completed'
  | 'payment.failed'
  | 'checkout.completed'
  | 'checkout.expired'
  | 'customer.created'
  | 'customer.updated'
  | 'payout.completed'
  | 'payout.failed';

/**
 * Client plugin options
 */
export interface MoneyMQClientPluginOptions {
  /**
   * Enable usage tracking on client
   */
  usage?: boolean;
}

/**
 * Record usage parameters
 */
export interface RecordUsageParams {
  /**
   * Metric name to record usage for
   */
  metric: string;
  /**
   * Quantity to record
   */
  quantity: number;
  /**
   * Optional metadata
   */
  metadata?: Record<string, string>;
}

/**
 * Get usage parameters
 */
export interface GetUsageParams {
  /**
   * Metric name to get usage for (optional, returns all if not specified)
   */
  metric?: string;
  /**
   * Start date for usage period
   */
  startDate?: Date;
  /**
   * End date for usage period
   */
  endDate?: Date;
  /**
   * Include billed usage records
   * @default false
   */
  includeBilled?: boolean;
}

/**
 * Usage summary response
 */
export interface UsageSummary {
  metric: string;
  displayName?: string;
  unit?: string;
  total: number;
  unbilledTotal: number;
  records: UsageRecord[];
}

/**
 * Create checkout parameters
 */
export interface CreateCheckoutParams {
  /**
   * Line items for the checkout
   */
  lineItems: Array<{ price: string; quantity: number }>;
  /**
   * URL to redirect to on success
   */
  successUrl: string;
  /**
   * URL to redirect to on cancel
   */
  cancelUrl: string;
  /**
   * Optional metadata
   */
  metadata?: Record<string, string>;
}
