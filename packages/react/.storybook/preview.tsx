import React from 'react';
import type { Preview, ReactRenderer } from '@storybook/react-vite';
import type { PartialStoryFn } from 'storybook/internal/types';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { MoneyMQContext, SandboxContext, type MoneyMQClient, type SandboxAccount } from '../src/provider';
import { CustomWalletModalProvider } from '../src/wallet-modal-provider';

// Mock client for Storybook
const mockClient: MoneyMQClient = {
  config: {
    endpoint: 'http://localhost:8488',
  },
};

// Mock sandbox accounts
const mockSandboxAccounts: SandboxAccount[] = [
  {
    id: 'alice',
    name: 'alice',
    address: 'ALicE1111111111111111111111111111111111111',
    secretKeyHex: '0000000000000000000000000000000000000000000000000000000000000001',
    usdcBalance: 1000,
  },
  {
    id: 'bob',
    name: 'bob',
    address: 'B0B11111111111111111111111111111111111111',
    secretKeyHex: '0000000000000000000000000000000000000000000000000000000000000002',
    usdcBalance: 500,
  },
  {
    id: 'charlie',
    name: 'charlie',
    address: 'CHaRL1E111111111111111111111111111111111',
    secretKeyHex: '0000000000000000000000000000000000000000000000000000000000000003',
    usdcBalance: 250,
  },
];

// Decorator to wrap stories with required providers
const withProviders = (Story: PartialStoryFn<ReactRenderer>) => {
  return (
    <MoneyMQContext.Provider value={mockClient}>
      <SandboxContext.Provider value={{ isSandboxMode: true, sandboxAccounts: mockSandboxAccounts }}>
        <ConnectionProvider endpoint="https://api.devnet.solana.com">
          <WalletProvider wallets={[]} autoConnect={false}>
            <CustomWalletModalProvider>
              <div style={{
                padding: '2rem',
                backgroundColor: '#1c1c1e',
                minHeight: '100vh',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontFeatureSettings: '"cv11"',
              }}>
                <Story />
              </div>
            </CustomWalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </SandboxContext.Provider>
    </MoneyMQContext.Provider>
  );
};

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1c1c1e' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [withProviders],
};

export default preview;
