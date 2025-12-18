import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';
import type { MoneyMQPluginOptions, UsageRecord, UsageMetric, WebhookEvent } from './types';

export type { MoneyMQPluginOptions, UsageRecord, UsageMetric, WebhookEvent };
export * from './types';

/**
 * MoneyMQ plugin for Better Auth
 *
 * Integrates MoneyMQ stablecoin payments with Better Auth for
 * customer creation and usage-based billing.
 *
 * @example
 * ```typescript
 * import { betterAuth } from 'better-auth';
 * import { moneymq } from '@moneymq/better-auth';
 * import { MoneyMQ } from '@moneymq/sdk';
 *
 * const moneymqClient = new MoneyMQ({
 *   endpoint: process.env.MONEYMQ_ENDPOINT!,
 *   secret: process.env.MONEYMQ_SECRET,
 * });
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     moneymq({
 *       client: moneymqClient,
 *       webhookSecret: process.env.MONEYMQ_WEBHOOK_SECRET,
 *       createCustomerOnSignUp: true,
 *       usage: {
 *         enabled: true,
 *         metrics: [
 *           { name: 'api_calls', priceId: 'price_xxx', unit: 'requests' },
 *           { name: 'storage', priceId: 'price_yyy', unit: 'GB' },
 *         ],
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export const moneymq = (options: MoneyMQPluginOptions) => {
  const {
    client,
    webhookSecret,
    createCustomerOnSignUp = true,
    onCustomerCreate,
    getCustomerCreateParams,
    onEvent,
    usage,
    schema,
  } = options;

  const usageTableName = schema?.usage?.modelName ?? 'moneymqUsage';

  return {
    id: 'moneymq',

    endpoints: {
      // Webhook endpoint for MoneyMQ events
      moneymqWebhook: createAuthEndpoint(
        '/moneymq/webhook',
        {
          method: 'POST',
          metadata: {
            isAction: false,
          },
        },
        async (ctx) => {
          const body = ctx.body as WebhookEvent;

          // Verify webhook signature if secret is provided
          if (webhookSecret) {
            const signature = ctx.request?.headers.get('x-moneymq-signature');
            if (!signature) {
              throw new Error('Missing webhook signature');
            }
            // TODO: Implement signature verification when MoneyMQ supports it
          }

          // Call custom event handler
          if (onEvent) {
            await onEvent(body);
          }

          // Handle payment completion - mark usage as billed
          if (body.type === 'payment.completed' && usage?.enabled) {
            const paymentId = body.data.id as string;
            const metadata = body.data.metadata as Record<string, string> | undefined;
            const usageIds = metadata?.usageIds?.split(',');

            if (usageIds?.length) {
              const now = new Date();
              const billedRecords: UsageRecord[] = [];

              for (const usageId of usageIds) {
                const record = await ctx.context.adapter.findOne<UsageRecord>({
                  model: usageTableName,
                  where: [{ field: 'id', value: usageId }],
                });

                if (record) {
                  await ctx.context.adapter.update({
                    model: usageTableName,
                    where: [{ field: 'id', value: usageId }],
                    update: {
                      billed: true,
                      billedAt: now,
                      paymentId,
                    },
                  });
                  billedRecords.push({ ...record, billed: true, billedAt: now, paymentId });
                }
              }

              if (usage.onUsageBilled && billedRecords.length) {
                await usage.onUsageBilled({
                  records: billedRecords,
                  paymentId,
                  amount: body.data.amount as number,
                });
              }
            }
          }

          return ctx.json({ received: true });
        },
      ),

      // Record usage
      recordUsage: createAuthEndpoint(
        '/moneymq/usage/record',
        {
          method: 'POST',
          body: z.object({
            metric: z.string(),
            quantity: z.number().positive(),
            metadata: z.record(z.string()).optional(),
          }),
        },
        async (ctx) => {
          if (!usage?.enabled) {
            throw new Error('Usage billing is not enabled');
          }

          const session = ctx.context.session;
          if (!session) {
            throw new Error('Unauthorized');
          }

          const user = session.user;
          const { metric, quantity, metadata } = ctx.body;

          // Verify metric exists
          const metricConfig = usage.metrics.find((m) => m.name === metric);
          if (!metricConfig) {
            throw new Error(`Metric "${metric}" is not configured`);
          }

          // Get customer ID
          const customerId = (user as { moneymqCustomerId?: string }).moneymqCustomerId;
          if (!customerId) {
            throw new Error('User does not have a MoneyMQ customer ID');
          }

          // Create usage record
          const now = new Date();
          const record: UsageRecord = {
            id: crypto.randomUUID(),
            userId: user.id,
            customerId,
            metric,
            quantity,
            timestamp: now,
            metadata,
            billed: false,
          };

          await ctx.context.adapter.create({
            model: usageTableName,
            data: record,
          });

          // Call callback
          if (usage.onUsageRecorded) {
            await usage.onUsageRecorded(record);
          }

          return ctx.json({ success: true, record });
        },
      ),

      // Get usage summary
      getUsage: createAuthEndpoint(
        '/moneymq/usage',
        {
          method: 'GET',
          query: z.object({
            metric: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            includeBilled: z.string().optional(),
          }),
        },
        async (ctx) => {
          if (!usage?.enabled) {
            throw new Error('Usage billing is not enabled');
          }

          const session = ctx.context.session;
          if (!session) {
            throw new Error('Unauthorized');
          }

          const user = session.user;
          const { metric, startDate, endDate, includeBilled } = ctx.query ?? {};

          // Build query conditions
          const where: Array<{ field: string; value: unknown; operator?: string }> = [
            { field: 'userId', value: user.id },
          ];

          if (metric) {
            where.push({ field: 'metric', value: metric });
          }

          if (includeBilled !== 'true') {
            where.push({ field: 'billed', value: false });
          }

          // Get records
          const records = await ctx.context.adapter.findMany<UsageRecord>({
            model: usageTableName,
            where,
          });

          // Filter by date if provided
          let filteredRecords = records;
          if (startDate) {
            const start = new Date(startDate);
            filteredRecords = filteredRecords.filter((r) => new Date(r.timestamp) >= start);
          }
          if (endDate) {
            const end = new Date(endDate);
            filteredRecords = filteredRecords.filter((r) => new Date(r.timestamp) <= end);
          }

          // Group by metric and aggregate
          const summaries: Record<string, typeof filteredRecords> = {};
          for (const record of filteredRecords) {
            if (!summaries[record.metric]) {
              summaries[record.metric] = [];
            }
            summaries[record.metric].push(record);
          }

          const result = Object.entries(summaries).map(([metricName, metricRecords]) => {
            const metricConfig = usage.metrics.find((m) => m.name === metricName);
            const aggregation = metricConfig?.aggregation ?? 'sum';

            let total = 0;
            let unbilledTotal = 0;

            if (aggregation === 'sum') {
              total = metricRecords.reduce((sum, r) => sum + r.quantity, 0);
              unbilledTotal = metricRecords.filter((r) => !r.billed).reduce((sum, r) => sum + r.quantity, 0);
            } else if (aggregation === 'max') {
              total = Math.max(...metricRecords.map((r) => r.quantity));
              const unbilledRecords = metricRecords.filter((r) => !r.billed);
              unbilledTotal = unbilledRecords.length ? Math.max(...unbilledRecords.map((r) => r.quantity)) : 0;
            } else if (aggregation === 'last') {
              const sorted = [...metricRecords].sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
              );
              total = sorted[0]?.quantity ?? 0;
              const unbilledSorted = sorted.filter((r) => !r.billed);
              unbilledTotal = unbilledSorted[0]?.quantity ?? 0;
            }

            return {
              metric: metricName,
              displayName: metricConfig?.displayName,
              unit: metricConfig?.unit,
              total,
              unbilledTotal,
              records: metricRecords,
            };
          });

          return ctx.json({ usage: result });
        },
      ),

      // Create checkout for usage billing
      createUsageCheckout: createAuthEndpoint(
        '/moneymq/usage/checkout',
        {
          method: 'POST',
          body: z.object({
            metrics: z.array(z.string()).optional(),
            successUrl: z.string(),
            cancelUrl: z.string(),
          }),
        },
        async (ctx) => {
          if (!usage?.enabled) {
            throw new Error('Usage billing is not enabled');
          }

          const session = ctx.context.session;
          if (!session) {
            throw new Error('Unauthorized');
          }

          const user = session.user;
          const { metrics: metricNames, successUrl, cancelUrl } = ctx.body;

          const customerId = (user as { moneymqCustomerId?: string }).moneymqCustomerId;
          if (!customerId) {
            throw new Error('User does not have a MoneyMQ customer ID');
          }

          // Get unbilled usage
          const where: Array<{ field: string; value: unknown }> = [
            { field: 'userId', value: user.id },
            { field: 'billed', value: false },
          ];

          const records = await ctx.context.adapter.findMany<UsageRecord>({
            model: usageTableName,
            where,
          });

          // Filter by requested metrics
          const filteredRecords = metricNames?.length
            ? records.filter((r) => metricNames.includes(r.metric))
            : records;

          if (!filteredRecords.length) {
            throw new Error('No unbilled usage to charge');
          }

          // Group by metric and calculate totals
          const metricTotals: Record<string, { quantity: number; priceId: string; recordIds: string[] }> = {};

          for (const record of filteredRecords) {
            const metricConfig = usage.metrics.find((m) => m.name === record.metric);
            if (!metricConfig) continue;

            if (!metricTotals[record.metric]) {
              metricTotals[record.metric] = {
                quantity: 0,
                priceId: metricConfig.priceId,
                recordIds: [],
              };
            }

            const aggregation = metricConfig.aggregation ?? 'sum';
            if (aggregation === 'sum') {
              metricTotals[record.metric].quantity += record.quantity;
            } else if (aggregation === 'max') {
              metricTotals[record.metric].quantity = Math.max(
                metricTotals[record.metric].quantity,
                record.quantity,
              );
            } else if (aggregation === 'last') {
              // For 'last', just use the most recent
              metricTotals[record.metric].quantity = record.quantity;
            }
            metricTotals[record.metric].recordIds.push(record.id);
          }

          // Create line items
          const lineItems = Object.values(metricTotals).map((m) => ({
            price: m.priceId,
            quantity: Math.ceil(m.quantity),
          }));

          // Collect all record IDs for marking as billed after payment
          const allRecordIds = Object.values(metricTotals).flatMap((m) => m.recordIds);

          // Create checkout session
          const checkoutSession = await client.payment.checkout.create({
            lineItems,
            successUrl,
            cancelUrl,
            customer: customerId,
            metadata: {
              userId: user.id,
              usageIds: allRecordIds.join(','),
              type: 'usage_billing',
            },
          });

          return ctx.json({
            url: checkoutSession.url,
            sessionId: checkoutSession.id,
            lineItems,
            totalRecords: allRecordIds.length,
          });
        },
      ),

      // Create a general checkout session
      createCheckout: createAuthEndpoint(
        '/moneymq/checkout',
        {
          method: 'POST',
          body: z.object({
            lineItems: z.array(
              z.object({
                price: z.string(),
                quantity: z.number().positive(),
              }),
            ),
            successUrl: z.string(),
            cancelUrl: z.string(),
            metadata: z.record(z.string()).optional(),
          }),
        },
        async (ctx) => {
          const session = ctx.context.session;
          if (!session) {
            throw new Error('Unauthorized');
          }

          const user = session.user;
          const { lineItems, successUrl, cancelUrl, metadata } = ctx.body;

          // Get or create customer
          let customerId = (user as { moneymqCustomerId?: string }).moneymqCustomerId;
          if (!customerId) {
            const customerParams = getCustomerCreateParams
              ? getCustomerCreateParams({
                  id: user.id,
                  email: user.email,
                  name: user.name,
                })
              : {
                  email: user.email,
                  name: user.name,
                };

            const customer = await client.payment.customers.create(customerParams);
            customerId = customer.id;

            // Update user with customer ID
            await ctx.context.internalAdapter.updateUser(user.id, {
              moneymqCustomerId: customerId,
            });
          }

          // Create checkout session
          const checkoutSession = await client.payment.checkout.create({
            lineItems,
            successUrl,
            cancelUrl,
            customer: customerId,
            metadata: {
              ...metadata,
              userId: user.id,
            },
          });

          return ctx.json({
            url: checkoutSession.url,
            sessionId: checkoutSession.id,
          });
        },
      ),

      // Get customer info
      getCustomer: createAuthEndpoint(
        '/moneymq/customer',
        {
          method: 'GET',
        },
        async (ctx) => {
          const session = ctx.context.session;
          if (!session) {
            throw new Error('Unauthorized');
          }

          const user = session.user;
          const customerId = (user as { moneymqCustomerId?: string }).moneymqCustomerId;

          if (!customerId) {
            return ctx.json({ customer: null });
          }

          try {
            const customer = await client.payment.customers.retrieve(customerId);
            return ctx.json({ customer });
          } catch {
            return ctx.json({ customer: null });
          }
        },
      ),

      // Get configured metrics
      getMetrics: createAuthEndpoint(
        '/moneymq/metrics',
        {
          method: 'GET',
        },
        async (ctx) => {
          if (!usage?.enabled) {
            return ctx.json({ metrics: [] });
          }

          const metrics = usage.metrics.map((m) => ({
            name: m.name,
            displayName: m.displayName,
            unit: m.unit,
            aggregation: m.aggregation ?? 'sum',
          }));

          return ctx.json({ metrics });
        },
      ),
    },

    schema: {
      user: {
        fields: {
          moneymqCustomerId: {
            type: 'string',
            required: false,
          },
        },
      },
      ...(usage?.enabled
        ? {
            [usageTableName]: {
              fields: {
                userId: {
                  type: 'string',
                  required: true,
                  references: {
                    model: 'user',
                    field: 'id',
                  },
                },
                customerId: {
                  type: 'string',
                  required: true,
                },
                metric: {
                  type: 'string',
                  required: true,
                },
                quantity: {
                  type: 'number',
                  required: true,
                },
                timestamp: {
                  type: 'date',
                  required: true,
                },
                billed: {
                  type: 'boolean',
                  required: true,
                },
                billedAt: {
                  type: 'date',
                  required: false,
                },
                paymentId: {
                  type: 'string',
                  required: false,
                },
              },
            },
          }
        : {}),
    },

    hooks: {
      after: [
        {
          matcher: (context) => context.path === '/sign-up/email',
          handler: async (ctx) => {
            if (!createCustomerOnSignUp) return;

            const response = ctx.response;
            if (!response || !(response instanceof Response)) return;

            try {
              const data = await response.clone().json();
              if (!data?.user) return;

              const user = data.user;

              // Create customer in MoneyMQ
              const customerParams = getCustomerCreateParams
                ? getCustomerCreateParams({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                  })
                : {
                    email: user.email,
                    name: user.name,
                  };

              const customer = await client.payment.customers.create(customerParams);

              // Update user with customer ID
              await ctx.context.internalAdapter.updateUser(user.id, {
                moneymqCustomerId: customer.id,
              });

              // Call callback
              if (onCustomerCreate) {
                await onCustomerCreate({
                  customer: { id: customer.id, email: customerParams.email },
                  user: { id: user.id, email: user.email },
                });
              }
            } catch {
              // Log but don't fail signup
              ctx.context.logger.error('Failed to create MoneyMQ customer');
            }
          },
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};

export default moneymq;
