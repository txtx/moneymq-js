'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppProvider, getDefaultConfig } from '@solana/connector';
import type { PaymentConfig } from '@moneymq/sdk';
import type { Branding } from './wallet-modal-provider';

// MoneyMQ client interface (matches @moneymq/sdk)
export interface MoneyMQClient {
  config: {
    endpoint: string;
  };
}

export interface MoneyMQProviderProps {
  children: React.ReactNode;
  client: MoneyMQClient;
  branding?: Branding;
  /** Set to true if the parent app already provides wallet connection (AppProvider) */
  skipWalletProvider?: boolean;
}

// Sandbox account interface
export interface SandboxAccount {
  id: string;
  name: string;
  address: string;
  secretKeyHex?: string;
  stablecoins?: {
    usdc?: string;
  };
  usdcBalance?: number;
}

// Sandbox context state
interface SandboxContextState {
  isSandboxMode: boolean;
  sandboxAccounts: SandboxAccount[];
}

export const MoneyMQContext = createContext<MoneyMQClient | null>(null);
export const SandboxContext = createContext<SandboxContextState>({
  isSandboxMode: false,
  sandboxAccounts: [],
});

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

interface SandboxAccountsResponse {
  solana?: {
    userAccounts?: Array<{
      address: string;
      label: string;
      secretKey?: string;
      stablecoins?: {
        usdc?: string;
      };
    }>;
  };
}

/**
 * Normalize RPC URL for browser access (0.0.0.0 doesn't work in browsers)
 */
function normalizeRpcUrl(url: string): string {
  return url.replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost');
}

/**
 * Fetch facilitator config from /payment/v1/config endpoint
 * Uses attrs=studio to include RPC/WS URLs
 */
async function getFacilitatorConfig(
  apiUrl: string,
): Promise<{ isSandbox: boolean; rpcUrl: string }> {
  try {
    const configUrl = `${apiUrl}/payment/v1/config?attrs=studio`;
    console.log('[MoneyMQ] Fetching facilitator config from:', configUrl);
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }
    const config = (await response.json()) as PaymentConfig;
    const rawRpcUrl = config.studio?.rpcUrl || DEFAULT_RPC_URL;
    const normalizedUrl = normalizeRpcUrl(rawRpcUrl);
    console.log('[MoneyMQ] Facilitator config:', {
      isSandbox: config.isSandbox,
      rpcUrl: normalizedUrl,
    });
    return {
      isSandbox: config.isSandbox,
      rpcUrl: normalizedUrl,
    };
  } catch (err) {
    console.error('[MoneyMQ] Error fetching facilitator config:', err);
    return {
      isSandbox: false,
      rpcUrl: DEFAULT_RPC_URL,
    };
  }
}

/**
 * Fetch token balance for a token account address
 */
async function fetchTokenBalance(rpcUrl: string, tokenAccountAddress: string): Promise<number> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [tokenAccountAddress, { encoding: 'jsonParsed' }],
      }),
    });
    const data = await response.json();
    if (data.result?.value?.data?.parsed?.info?.tokenAmount) {
      return parseFloat(data.result.value.data.parsed.info.tokenAmount.uiAmountString || '0');
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Fetch sandbox accounts from the MoneyMQ server
 */
async function fetchSandboxAccounts(apiUrl: string, rpcUrl: string): Promise<SandboxAccount[]> {
  try {
    console.log('[MoneyMQ] Fetching sandbox accounts from:', `${apiUrl}/payment/v1/accounts`);
    const response = await fetch(`${apiUrl}/payment/v1/accounts`);
    if (!response.ok) {
      console.log('[MoneyMQ] Sandbox accounts fetch failed:', response.status);
      return [];
    }

    const data = (await response.json()) as SandboxAccountsResponse;
    if (data.solana?.userAccounts) {
      // Fetch balances for each account in parallel
      const accounts = await Promise.all(
        data.solana.userAccounts.map(async (acc) => {
          let usdcBalance = 0;
          if (acc.stablecoins?.usdc) {
            usdcBalance = await fetchTokenBalance(rpcUrl, acc.stablecoins.usdc);
          }
          return {
            id: acc.address,
            name: acc.label,
            address: acc.address,
            secretKeyHex: acc.secretKey,
            stablecoins: acc.stablecoins,
            usdcBalance,
          };
        }),
      );
      console.log('[MoneyMQ] Sandbox accounts loaded:', accounts.length);
      return accounts;
    }
    return [];
  } catch (err) {
    console.error('[MoneyMQ] Error fetching sandbox accounts:', err);
    return [];
  }
}

export function useMoneyMQ(): MoneyMQClient {
  const client = useContext(MoneyMQContext);
  if (!client) {
    throw new Error('useMoneyMQ must be used within a MoneyMQProvider');
  }
  return client;
}

export function useSandbox(): SandboxContextState {
  return useContext(SandboxContext);
}

export function MoneyMQProvider({ children, client, branding }: MoneyMQProviderProps) {
  const [rpcEndpoint, setRpcEndpoint] = useState<string | null>(null);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [sandboxAccounts, setSandboxAccounts] = useState<SandboxAccount[]>([]);

  useEffect(() => {
    async function initialize() {
      console.log('[MoneyMQ] Initializing MoneyMQProvider...');
      // Fetch facilitator config (includes sandbox mode and RPC URL)
      const { isSandbox, rpcUrl } = await getFacilitatorConfig(client.config.endpoint);
      console.log('[MoneyMQ] Setting RPC endpoint to:', rpcUrl);
      setRpcEndpoint(rpcUrl);
      setIsSandboxMode(isSandbox);

      // If in sandbox mode, fetch sandbox accounts
      if (isSandbox) {
        const accounts = await fetchSandboxAccounts(client.config.endpoint, rpcUrl);
        setSandboxAccounts(accounts);
      }
    }
    initialize();
  }, [client.config.endpoint]);

  const connectorConfig = useMemo(
    () =>
      getDefaultConfig({
        appName: 'MoneyMQ Checkout',
        autoConnect: true,
      }),
    [],
  );

  const sandboxContextValue = useMemo(
    () => ({ isSandboxMode, sandboxAccounts }),
    [isSandboxMode, sandboxAccounts],
  );

  return (
    <MoneyMQContext.Provider value={client}>
      <SandboxContext.Provider value={sandboxContextValue}>
        <AppProvider connectorConfig={connectorConfig}>{children}</AppProvider>
      </SandboxContext.Provider>
    </MoneyMQContext.Provider>
  );
}
