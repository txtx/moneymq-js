/**
 * MoneyMQ server configuration returned from /config endpoint
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
 * Fetch server configuration from MoneyMQ API
 *
 * @param apiUrl - The MoneyMQ API URL
 * @returns Server configuration including RPC URL
 *
 * @example
 * ```typescript
 * const config = await fetchConfig('http://localhost:8488');
 * console.log(config.x402.validator.rpcUrl);
 * ```
 */
export async function fetchConfig(apiUrl: string): Promise<ServerConfig> {
  const response = await fetch(`${apiUrl}/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.status}`);
  }
  return response.json() as Promise<ServerConfig>;
}

/**
 * Get the Solana RPC URL from server config
 *
 * @param apiUrl - The MoneyMQ API URL
 * @param fallback - Fallback RPC URL if fetch fails
 * @returns RPC URL string
 */
export async function getRpcUrl(
  apiUrl: string,
  fallback = 'https://api.devnet.solana.com'
): Promise<string> {
  try {
    const config = await fetchConfig(apiUrl);
    return config.x402.validator.rpcUrl || fallback;
  } catch {
    return fallback;
  }
}
