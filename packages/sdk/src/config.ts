/** Base path for payment API endpoints */
export const PAYMENT_API_PATH = '/payment/v1';

/**
 * Payment API configuration returned from /payment/v1/config endpoint
 */
export interface PaymentConfig {
  isSandbox: boolean;
  x402: {
    solana: {
      payout: {
        recipientAddress?: string;
        recipientTokenAccount?: string;
        tokenAddress: string;
      };
      facilitator: {
        address?: string;
      };
    };
  };
  stack: {
    name?: string;
    imageUrl?: string;
  };
  studio?: {
    rpcUrl?: string;
    wsUrl?: string;
  };
}

/**
 * Legacy server configuration returned from /config endpoint
 * @deprecated Use PaymentConfig and fetchPaymentConfig instead
 */
export interface ServerConfig {
  account: {
    name: string;
    description: string;
  };
  x402: {
    payoutAccount: {
      currency: string;
      decimals: number;
      address: string;
      tokenAddress: string;
    };
    facilitator: {
      operatorAccount: {
        out: string;
        in: {
          currency: string;
          decimals: number;
          address: string;
          tokenAddress: string;
        };
      };
      url: string;
    };
    validator: {
      network: string;
      rpcUrl: string;
      bindHost: string;
      rpcPort: number;
      wsPort: number;
    };
  };
}

/**
 * Fetch payment configuration from MoneyMQ Payment API
 *
 * @param apiUrl - The MoneyMQ API URL
 * @param includeStudio - Include studio config (RPC/WS URLs)
 * @returns Payment configuration
 *
 * @example
 * ```typescript
 * const config = await fetchPaymentConfig('http://localhost:8488', true);
 * console.log(config.studio?.rpcUrl);
 * ```
 */
export async function fetchPaymentConfig(
  apiUrl: string,
  includeStudio = false,
): Promise<PaymentConfig> {
  const url = includeStudio
    ? `${apiUrl}${PAYMENT_API_PATH}/config?attrs=studio`
    : `${apiUrl}${PAYMENT_API_PATH}/config`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.status}`);
  }
  return response.json() as Promise<PaymentConfig>;
}

/**
 * Fetch server configuration from MoneyMQ API
 * @deprecated Use fetchPaymentConfig instead
 *
 * @param apiUrl - The MoneyMQ API URL
 * @returns Server configuration including RPC URL
 */
export async function fetchConfig(apiUrl: string): Promise<ServerConfig> {
  const response = await fetch(`${apiUrl}${PAYMENT_API_PATH}/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.status}`);
  }
  return response.json() as Promise<ServerConfig>;
}

/**
 * Get the Solana RPC URL from payment config
 *
 * @param apiUrl - The MoneyMQ API URL
 * @param fallback - Fallback RPC URL if fetch fails
 * @returns RPC URL string
 */
export async function getRpcUrl(
  apiUrl: string,
  fallback = 'https://api.devnet.solana.com',
): Promise<string> {
  try {
    const config = await fetchPaymentConfig(apiUrl, true);
    return config.studio?.rpcUrl || fallback;
  } catch {
    return fallback;
  }
}
