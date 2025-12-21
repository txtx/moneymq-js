import type { MoneyMQConfig } from './client';
import { fetchConfig, type ServerConfig } from './config';
import { createSigner, type Signer } from 'x402-fetch';

/**
 * Parameters for getting a signer by tag
 */
export interface GetSignerParams {
  /**
   * Tag/label identifying the sandbox wallet account
   * @example 'alice', 'bob', 'agent-1'
   */
  tag: string;
}

/**
 * Re-export Signer type from x402-fetch
 */
export type { Signer } from 'x402-fetch';

/**
 * X402 configuration compatible with x402-fetch wrapFetchWithPayment
 */
export interface X402ClientConfig {
  svmConfig?: {
    rpcUrl: string;
  };
}

/**
 * Response structure from /sandbox/accounts endpoint
 */
interface SandboxAccountsResponse {
  [network: string]: {
    network: string;
    payTo: string;
    userAccounts: Array<{
      address: string;
      secretKeyHex?: string;
      label?: string;
      stablecoins?: {
        usdc?: string;
      };
    }>;
  };
}

/**
 * X402 API for agentic payments
 *
 * @example
 * ```typescript
 * import { wrapFetchWithPayment } from 'x402-fetch';
 *
 * const moneymq = new MoneyMQ({
 *   endpoint: 'http://localhost:8488',
 * });
 *
 * // Get signer for sandbox account by label
 * const payer = await moneymq.x402.getSigner({ tag: 'alice' });
 *
 * // Get x402 config for the fetch wrapper
 * const config = await moneymq.x402.getConfig();
 *
 * // Create the payment-enabled fetch
 * const fetchWithPayment = wrapFetchWithPayment(
 *   fetch,
 *   payer,
 *   undefined,
 *   undefined,
 *   config,
 * );
 *
 * // Make requests that automatically handle 402 payments
 * const response = await fetchWithPayment(url, { method: 'GET' });
 * ```
 */
export class X402API {
  private serverConfig: ServerConfig | null = null;
  private sandboxAccounts: SandboxAccountsResponse | null = null;

  constructor(private config: MoneyMQConfig) {}

  /**
   * Fetch sandbox accounts from the server
   */
  private async fetchSandboxAccounts(): Promise<SandboxAccountsResponse> {
    if (this.sandboxAccounts) {
      return this.sandboxAccounts;
    }

    const response = await fetch(`${this.config.endpoint}/sandbox/accounts`);
    if (!response.ok) {
      throw new Error(`Failed to fetch sandbox accounts: ${response.status}`);
    }

    this.sandboxAccounts = await response.json() as SandboxAccountsResponse;
    return this.sandboxAccounts;
  }

  /**
   * Get a signer for a sandbox account by tag/label
   *
   * @param params - Parameters containing the wallet tag/label
   * @returns A Signer that can be used directly with wrapFetchWithPayment
   *
   * @example
   * ```typescript
   * const payer = await moneymq.x402.getSigner({ tag: 'alice' });
   * ```
   */
  async getSigner(params: GetSignerParams): Promise<Signer> {
    const accounts = await this.fetchSandboxAccounts();

    // Search through all networks for an account with matching label
    for (const networkData of Object.values(accounts)) {
      for (const account of networkData.userAccounts) {
        if (account.label === params.tag) {
          if (!account.secretKeyHex) {
            throw new Error(`Account '${params.tag}' does not have a secret key (not locally managed)`);
          }
          // Create and return the signer directly
          return createSigner('solana', account.secretKeyHex);
        }
      }
    }

    throw new Error(`No sandbox account found with label '${params.tag}'`);
  }

  /**
   * Get x402 configuration for use with wrapFetchWithPayment
   *
   * @returns Configuration object compatible with x402-fetch
   *
   * @example
   * ```typescript
   * const config = await moneymq.x402.getConfig();
   * const fetchWithPayment = wrapFetchWithPayment(fetch, payer, undefined, undefined, config);
   * ```
   */
  async getConfig(): Promise<X402ClientConfig> {
    // Cache the server config
    if (!this.serverConfig) {
      this.serverConfig = await fetchConfig(this.config.endpoint);
    }

    return {
      svmConfig: {
        rpcUrl: this.serverConfig.x402.validator.rpcUrl,
      },
    };
  }

  /**
   * Get the full server configuration
   *
   * @returns The complete server configuration including x402 settings
   */
  async getServerConfig(): Promise<ServerConfig> {
    if (!this.serverConfig) {
      this.serverConfig = await fetchConfig(this.config.endpoint);
    }
    return this.serverConfig;
  }
}
