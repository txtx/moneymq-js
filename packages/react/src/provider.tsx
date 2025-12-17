'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { CustomWalletModalProvider, type Branding } from './wallet-modal-provider';

// MoneyMQ client interface (matches @moneymq/sdk)
export interface MoneyMQClient {
  config: {
    url: string;
  };
}

export interface MoneyMQProviderProps {
  children: React.ReactNode;
  client: MoneyMQClient;
  branding?: Branding;
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

const MoneyMQContext = createContext<MoneyMQClient | null>(null);
const SandboxContext = createContext<SandboxContextState>({
  isSandboxMode: false,
  sandboxAccounts: [],
});

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
const SANDBOX_HASH_PREFIX = 'SURFNETxSAFEHASH';

interface ServerConfigResponse {
  x402?: {
    validator?: {
      rpcUrl?: string;
    };
  };
}

interface SandboxAccountsResponse {
  solana?: {
    userAccounts?: Array<{
      address: string;
      label: string;
      secretKeyHex?: string;
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
 * Get RPC URL from MoneyMQ server config
 */
async function getRpcUrl(apiUrl: string): Promise<string> {
  try {
    console.log('[MoneyMQ] Fetching config from:', `${apiUrl}/config`);
    const response = await fetch(`${apiUrl}/config`);
    const config = (await response.json()) as ServerConfigResponse;
    const rawRpcUrl = config.x402?.validator?.rpcUrl || DEFAULT_RPC_URL;
    console.log('[MoneyMQ] Raw RPC URL from config:', rawRpcUrl);
    const normalizedUrl = normalizeRpcUrl(rawRpcUrl);
    console.log('[MoneyMQ] Normalized RPC URL:', normalizedUrl);
    return normalizedUrl;
  } catch (err) {
    console.error('[MoneyMQ] Error fetching config:', err);
    return DEFAULT_RPC_URL;
  }
}

/**
 * Check if we're in sandbox mode by calling getLatestBlockhash RPC
 */
async function checkSandboxMode(rpcUrl: string): Promise<boolean> {
  try {
    console.log('[MoneyMQ] Checking sandbox mode with RPC:', rpcUrl);
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'finalized' }],
      }),
    });
    const data = await response.json();
    const blockhash = data?.result?.value?.blockhash || '';
    const isSandbox = blockhash.startsWith(SANDBOX_HASH_PREFIX);
    console.log('[MoneyMQ] Blockhash:', blockhash, '| Sandbox:', isSandbox);
    return isSandbox;
  } catch (err) {
    console.error('[MoneyMQ] Error checking sandbox mode:', err);
    return false;
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
    console.log('[MoneyMQ] Fetching sandbox accounts from:', `${apiUrl}/sandbox/accounts`);
    const response = await fetch(`${apiUrl}/sandbox/accounts`);
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
            secretKeyHex: acc.secretKeyHex,
            stablecoins: acc.stablecoins,
            usdcBalance,
          };
        })
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

export function MoneyMQProvider({
  children,
  client,
  branding,
}: MoneyMQProviderProps) {
  const [rpcEndpoint, setRpcEndpoint] = useState<string | null>(null);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [sandboxAccounts, setSandboxAccounts] = useState<SandboxAccount[]>([]);

  useEffect(() => {
    async function initialize() {
      const rpcUrl = await getRpcUrl(client.config.url);
      setRpcEndpoint(rpcUrl);

      // Check if we're in sandbox mode
      const isSandbox = await checkSandboxMode(rpcUrl);
      setIsSandboxMode(isSandbox);

      // If in sandbox mode, fetch sandbox accounts
      if (isSandbox) {
        const accounts = await fetchSandboxAccounts(client.config.url, rpcUrl);
        setSandboxAccounts(accounts);
      }
    }
    initialize();
  }, [client.config.url]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  const sandboxContextValue = useMemo(
    () => ({ isSandboxMode, sandboxAccounts }),
    [isSandboxMode, sandboxAccounts]
  );

  // Don't render until we have the RPC endpoint
  if (!rpcEndpoint) {
    return null;
  }

  return (
    <MoneyMQContext.Provider value={client}>
      <SandboxContext.Provider value={sandboxContextValue}>
        <ConnectionProvider endpoint={rpcEndpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <CustomWalletModalProvider branding={branding}>
              {children}
            </CustomWalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </SandboxContext.Provider>
    </MoneyMQContext.Provider>
  );
}
