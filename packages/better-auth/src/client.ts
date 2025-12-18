import type { BetterAuthClientPlugin } from 'better-auth/client';
import type { moneymq } from './index';
import type {
  MoneyMQClientPluginOptions,
  RecordUsageParams,
  GetUsageParams,
  UsageSummary,
  CreateCheckoutParams,
} from './types';

export type { MoneyMQClientPluginOptions, RecordUsageParams, GetUsageParams, UsageSummary, CreateCheckoutParams };

/**
 * MoneyMQ client plugin for Better Auth
 *
 * Provides client-side methods for usage tracking, checkout creation,
 * and customer management.
 *
 * @example
 * ```typescript
 * import { createAuthClient } from 'better-auth/client';
 * import { moneymqClient } from '@moneymq/better-auth/client';
 *
 * export const authClient = createAuthClient({
 *   plugins: [
 *     moneymqClient({
 *       usage: true,
 *     }),
 *   ],
 * });
 *
 * // Record usage
 * await authClient.moneymq.recordUsage({
 *   metric: 'api_calls',
 *   quantity: 1,
 * });
 *
 * // Get usage summary
 * const { usage } = await authClient.moneymq.getUsage();
 *
 * // Create checkout for usage
 * const { url } = await authClient.moneymq.createUsageCheckout({
 *   successUrl: '/success',
 *   cancelUrl: '/cancel',
 * });
 * ```
 */
export const moneymqClient = (options?: MoneyMQClientPluginOptions) => {
  return {
    id: 'moneymq',
    $InferServerPlugin: {} as ReturnType<typeof moneymq>,

    getActions: ($fetch) => ({
      /**
       * Record usage for a metric
       */
      recordUsage: async (
        params: RecordUsageParams,
        fetchOptions?: Parameters<typeof $fetch>[1],
      ) => {
        return $fetch<{ success: boolean; record: Record<string, unknown> }>(
          '/moneymq/usage/record',
          {
            method: 'POST',
            body: params,
            ...fetchOptions,
          },
        );
      },

      /**
       * Get usage summary for the current user
       */
      getUsage: async (params?: GetUsageParams, fetchOptions?: Parameters<typeof $fetch>[1]) => {
        const query = new URLSearchParams();
        if (params?.metric) query.set('metric', params.metric);
        if (params?.startDate) query.set('startDate', params.startDate.toISOString());
        if (params?.endDate) query.set('endDate', params.endDate.toISOString());
        if (params?.includeBilled) query.set('includeBilled', 'true');

        const queryString = query.toString();
        return $fetch<{ usage: UsageSummary[] }>(
          `/moneymq/usage${queryString ? `?${queryString}` : ''}`,
          {
            method: 'GET',
            ...fetchOptions,
          },
        );
      },

      /**
       * Create a checkout session for unbilled usage
       */
      createUsageCheckout: async (
        params: {
          metrics?: string[];
          successUrl: string;
          cancelUrl: string;
        },
        fetchOptions?: Parameters<typeof $fetch>[1],
      ) => {
        return $fetch<{
          url: string;
          sessionId: string;
          lineItems: Array<{ price: string; quantity: number }>;
          totalRecords: number;
        }>('/moneymq/usage/checkout', {
          method: 'POST',
          body: params,
          ...fetchOptions,
        });
      },

      /**
       * Create a general checkout session
       */
      createCheckout: async (
        params: CreateCheckoutParams,
        fetchOptions?: Parameters<typeof $fetch>[1],
      ) => {
        return $fetch<{ url: string; sessionId: string }>('/moneymq/checkout', {
          method: 'POST',
          body: params,
          ...fetchOptions,
        });
      },

      /**
       * Get the current user's MoneyMQ customer
       */
      getCustomer: async (fetchOptions?: Parameters<typeof $fetch>[1]) => {
        return $fetch<{ customer: Record<string, unknown> | null }>('/moneymq/customer', {
          method: 'GET',
          ...fetchOptions,
        });
      },

      /**
       * Get available usage metrics
       */
      getMetrics: async (fetchOptions?: Parameters<typeof $fetch>[1]) => {
        return $fetch<{
          metrics: Array<{
            name: string;
            displayName?: string;
            unit?: string;
            aggregation: 'sum' | 'max' | 'last';
          }>;
        }>('/moneymq/metrics', {
          method: 'GET',
          ...fetchOptions,
        });
      },
    }),

    pathMethods: {
      '/moneymq/usage/record': 'POST',
      '/moneymq/usage': 'GET',
      '/moneymq/usage/checkout': 'POST',
      '/moneymq/checkout': 'POST',
      '/moneymq/customer': 'GET',
      '/moneymq/metrics': 'GET',
      '/moneymq/webhook': 'POST',
    },
  } satisfies BetterAuthClientPlugin;
};

export default moneymqClient;
