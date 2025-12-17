'use client';

import React, { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Wallet } from '@solana/wallet-adapter-react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useBranding } from './wallet-modal-provider';
import { useMoneyMQ, useSandbox, type SandboxAccount } from './provider';

// Helper to convert object to form-encoded data
function encodeFormData(data: Record<string, unknown>): string {
  const params = new URLSearchParams();

  const addParams = (obj: Record<string, unknown>, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const paramKey = prefix ? `${prefix}[${key}]` : key;

      if (value === null || value === undefined) {
        continue;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        addParams(value as Record<string, unknown>, paramKey);
      } else {
        params.append(paramKey, String(value));
      }
    }
  };

  addParams(data);
  return params.toString();
}

// Normalize RPC URL for browser access
function normalizeRpcUrl(url: string): string {
  return url.replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost');
}

// Handle 402 Payment Required responses
async function makeRequestWith402Handling(
  url: string,
  method: 'POST' | 'GET',
  body: Record<string, unknown> | undefined,
  secretKeyHex: string,
  rpcUrl: string,
  headers: Record<string, string> = {}
): Promise<unknown> {
  console.log(`[MoneyMQ] Making ${method} request to ${url}`);
  const formData = body ? encodeFormData(body) : undefined;

  let response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: formData,
  });

  let data = await response.json();
  console.log(`[MoneyMQ] Response status: ${response.status}`, data);

  // Handle 402 Payment Required
  if (response.status === 402) {
    console.log('[MoneyMQ] 💳 402 Payment Required - processing payment...');

    const paymentRequirements = data?.payment_requirements || data?.error?.payment_requirements || [];

    if (paymentRequirements.length === 0) {
      console.warn('[MoneyMQ] ⚠️  No payment requirements found in 402 response');
      throw new Error('Payment required but no payment requirements provided');
    }

    console.log('[MoneyMQ] Payment requirements:', paymentRequirements);

    // Dynamic import x402 libraries
    const { createPaymentHeader, selectPaymentRequirements } = await import('x402/client');
    const { createSigner } = await import('x402-fetch');

    // Create signer from secret key
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const signer = await createSigner('solana', secretKeyHex, {
      svmConfig: rpcUrl,
    });

    // Select appropriate payment requirement
    const selectedPaymentRequirement = selectPaymentRequirements(paymentRequirements, 'solana', 'exact');

    console.log(`[MoneyMQ] 💰 Creating payment for ${selectedPaymentRequirement.network}...`);

    // Create payment header
    const paymentHeaderValue = await createPaymentHeader(
      signer,
      1, // x402Version
      selectedPaymentRequirement,
      {
        svmConfig: {
          rpcUrl,
        },
      }
    );

    console.log('[MoneyMQ] ✅ Payment header created, retrying request...');

    // Retry with X-Payment header
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Payment': paymentHeaderValue,
        ...headers,
      },
      body: formData,
    });

    data = await response.json();
    console.log(`[MoneyMQ] Retry response status: ${response.status}`, data);

    if (!response.ok) {
      throw new Error(data.error?.message || 'Request failed after payment');
    }
  } else if (!response.ok) {
    throw new Error(data.error?.message || 'Request failed');
  }

  return data;
}

// Create and confirm payment intent for sandbox accounts
async function createSandboxPayment(
  apiUrl: string,
  rpcUrl: string,
  amount: number,
  currency: string,
  recipient: string,
  senderAddress: string,
  secretKeyHex: string,
  productName?: string
): Promise<string> {
  console.log('[MoneyMQ] Creating sandbox payment...', { amount, currency, recipient, senderAddress });

  // Step 1: Create payment intent
  const paymentIntent = await makeRequestWith402Handling(
    `${apiUrl}/v1/payment_intents`,
    'POST',
    {
      amount: Math.round(amount * 100), // Convert to cents (Stripe-style)
      currency: currency.toLowerCase(),
      customer: senderAddress,
      description: productName ? `Purchase - ${productName}` : 'Payment',
      metadata: {
        sender_address: senderAddress,
        recipient_address: recipient,
      },
    },
    secretKeyHex,
    rpcUrl
  ) as { id: string };

  console.log('[MoneyMQ] Payment intent created:', paymentIntent);

  // Step 2: Confirm payment intent
  console.log('[MoneyMQ] Confirming payment intent:', paymentIntent.id);
  const confirmedIntent = await makeRequestWith402Handling(
    `${apiUrl}/v1/payment_intents/${paymentIntent.id}/confirm`,
    'POST',
    {},
    secretKeyHex,
    rpcUrl
  ) as { id: string; status: string };

  console.log('[MoneyMQ] Payment intent confirmed:', confirmedIntent);

  return confirmedIntent.id;
}

// Payment method types
type PaymentMethodType = 'browser_extension' | 'sandbox_account';

interface SelectedPaymentMethod {
  type: PaymentMethodType;
  wallet?: Wallet;
  sandboxAccount?: SandboxAccount;
}

export interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  currency: string;
  recipient: string;
  productName?: string;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
  accentColor?: string;
}

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function PaymentModal({
  visible,
  onClose,
  amount,
  currency,
  recipient,
  productName,
  onSuccess,
  onError,
  accentColor = '#ec4899',
}: PaymentModalProps) {
  const [isSending, setIsSending] = useState(false);
  const [copiedSender, setCopiedSender] = useState(false);
  const [copiedRecipient, setCopiedRecipient] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SelectedPaymentMethod | null>(null);
  const { publicKey, connected, disconnect, wallets, select, wallet: connectedWallet } = useWallet();
  const branding = useBranding();
  const { isSandboxMode, sandboxAccounts } = useSandbox();
  const client = useMoneyMQ();

  const copyToClipboard = (text: string, type: 'sender' | 'recipient') => {
    navigator.clipboard.writeText(text);
    if (type === 'sender') {
      setCopiedSender(true);
      setTimeout(() => setCopiedSender(false), 2000);
    } else {
      setCopiedRecipient(true);
      setTimeout(() => setCopiedRecipient(false), 2000);
    }
  };

  const handleSelectWallet = (wallet: Wallet) => {
    setSelectedWallet(wallet);
    setSelectedPaymentMethod({ type: 'browser_extension', wallet });
    select(wallet.adapter.name);
  };

  const handleSelectSandboxAccount = (account: SandboxAccount) => {
    setSelectedPaymentMethod({ type: 'sandbox_account', sandboxAccount: account });
    setSelectedWallet(null);
  };

  const handleDisconnect = async () => {
    await disconnect();
    setSelectedWallet(null);
    setSelectedPaymentMethod(null);
  };

  // Filter to only show installed/detected wallets
  const availableWallets = wallets.filter(
    (wallet) => wallet.readyState === 'Installed' || wallet.readyState === 'Loadable'
  );

  // Limit sandbox accounts to first 3
  const displayedSandboxAccounts = sandboxAccounts.slice(0, 3);

  // Get the current wallet icon (connected wallet, selected wallet, or default)
  const currentWalletIcon = connectedWallet?.adapter.icon || selectedWallet?.adapter.icon;
  const currentWalletName = connectedWallet?.adapter.name || selectedWallet?.adapter.name;

  // Get current selection display info
  const getCurrentSelectionDisplay = () => {
    if (connected && publicKey) {
      return {
        icon: currentWalletIcon,
        name: currentWalletName,
        address: publicKey.toBase58(),
        type: 'browser_extension' as const,
      };
    }
    if (selectedPaymentMethod?.type === 'sandbox_account' && selectedPaymentMethod.sandboxAccount) {
      const name = selectedPaymentMethod.sandboxAccount.name;
      return {
        icon: null,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        address: selectedPaymentMethod.sandboxAccount.address,
        type: 'sandbox_account' as const,
      };
    }
    return null;
  };

  const currentSelection = getCurrentSelectionDisplay();

  const handlePay = useCallback(async () => {
    if (!recipient) return;

    // Determine the sender based on payment method
    let senderAddress: string;
    let secretKeyHex: string | undefined;

    if (selectedPaymentMethod?.type === 'sandbox_account' && selectedPaymentMethod.sandboxAccount) {
      senderAddress = selectedPaymentMethod.sandboxAccount.address;
      secretKeyHex = selectedPaymentMethod.sandboxAccount.secretKeyHex;
    } else if (publicKey) {
      senderAddress = publicKey.toBase58();
    } else {
      return;
    }

    setIsSending(true);

    try {
      // For sandbox accounts, handle payment directly
      if (selectedPaymentMethod?.type === 'sandbox_account' && secretKeyHex) {
        const apiUrl = normalizeRpcUrl(client.config.url);

        // Fetch RPC URL from config
        let rpcUrl = 'http://localhost:8899';
        try {
          const configResponse = await fetch(`${apiUrl}/config`);
          const config = await configResponse.json();
          rpcUrl = normalizeRpcUrl(config.x402?.validator?.rpcUrl || rpcUrl);
        } catch {
          console.log('[MoneyMQ] Using default RPC URL');
        }

        const paymentId = await createSandboxPayment(
          apiUrl,
          rpcUrl,
          amount,
          currency,
          recipient,
          senderAddress,
          secretKeyHex,
          productName
        );

        setIsSending(false);
        onSuccess?.(paymentId);
        onClose();
        return;
      }

      // For browser extension wallets, dispatch event for external handling
      const event = new CustomEvent('moneymq:payment-initiated', {
        detail: {
          amount,
          currency,
          recipient,
          sender: senderAddress,
          paymentMethod: selectedPaymentMethod?.type || 'browser_extension',
        },
        bubbles: true,
      });
      window.dispatchEvent(event);

      const signature = await new Promise<string>((resolve, reject) => {
        const handleSuccess = (e: Event) => {
          const customEvent = e as CustomEvent<{ signature: string }>;
          cleanup();
          resolve(customEvent.detail.signature);
        };

        const handleError = (e: Event) => {
          const customEvent = e as CustomEvent<Error>;
          cleanup();
          reject(customEvent.detail);
        };

        const cleanup = () => {
          window.removeEventListener('moneymq:payment-success', handleSuccess);
          window.removeEventListener('moneymq:payment-error', handleError);
        };

        window.addEventListener('moneymq:payment-success', handleSuccess);
        window.addEventListener('moneymq:payment-error', handleError);

        setTimeout(() => {
          cleanup();
          reject(new Error('Payment timeout'));
        }, 60000);
      });

      setIsSending(false);
      onSuccess?.(signature);
      onClose();
    } catch (err) {
      console.error('Payment failed:', err);
      setIsSending(false);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [publicKey, recipient, amount, currency, onSuccess, onError, onClose, selectedPaymentMethod, client.config.url, productName]);

  // Can pay with either browser extension (connected) or sandbox account
  const canPay = (
    ((connected && publicKey) || selectedPaymentMethod?.type === 'sandbox_account') &&
    recipient &&
    !isSending
  );

  if (!visible) return null;

  // Wallet icon SVG
  const WalletIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5z" />
      <path d="M16 12h.01" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  // Sandbox account icon SVG (beaker/test tube)
  const SandboxIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23.693L5 15.5m14.8-.2a2.25 2.25 0 0 1 .775 2.646l-.972 2.916a2.25 2.25 0 0 1-2.134 1.538H6.532a2.25 2.25 0 0 1-2.135-1.538l-.971-2.916A2.25 2.25 0 0 1 4.2 15.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );


  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
        onClick={onClose}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '380px',
            backgroundColor: '#2c2c2e',
            borderRadius: '1rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              borderBottom: '1px solid #3a3a3c',
            }}
          >
            {branding?.logo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <img
                  src={branding.logo}
                  alt="Logo"
                  style={{ height: '24px', width: 'auto', filter: 'invert(1)' }}
                />
                {isSandboxMode && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ff9f0a' }}>
                    | SANDBOX
                  </span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill={accentColor} />
                  <path d="M8 12l2.5 2.5L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fff' }}>Pay</span>
                {isSandboxMode && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ff9f0a' }}>
                    | SANDBOX
                  </span>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#0a84ff',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '0.75rem' }}>
            {/* From (Wallet/Sandbox) Card */}
            {currentSelection ? (
              <div
                style={{
                  backgroundColor: '#3a3a3c',
                  borderRadius: '0.75rem',
                  padding: '0.875rem 1rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '0.5rem',
                      backgroundColor: currentSelection.icon ? 'transparent' : '#636366',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      overflow: 'hidden',
                    }}
                  >
                    {currentSelection.icon ? (
                      <img
                        src={currentSelection.icon}
                        alt={currentSelection.name || 'Wallet'}
                        style={{ width: '40px', height: '40px', borderRadius: '0.5rem' }}
                      />
                    ) : currentSelection.type === 'sandbox_account' ? (
                      <SandboxIcon />
                    ) : (
                      <WalletIcon />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>
                        From {truncateAddress(currentSelection.address)}
                      </span>
                      <button
                        onClick={() => copyToClipboard(currentSelection.address, 'sender')}
                        style={{
                          padding: 0,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedSender ? '#30d158' : '#8e8e93',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                    <span
                      style={{
                        fontSize: '0.9375rem',
                        fontWeight: 500,
                        color: '#fff',
                      }}
                    >
                      {currentSelection.name}
                    </span>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: '#ff453a',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.25rem 0.5rem',
                    }}
                  >
                    unlink
                  </button>
                </div>
              </div>
            ) : (
              <Menu as="div" style={{ position: 'relative', marginBottom: '0.5rem' }}>
                <MenuButton
                  style={{
                    width: '100%',
                    backgroundColor: '#3a3a3c',
                    borderRadius: '0.75rem',
                    padding: '0.875rem 1rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '0.5rem',
                      backgroundColor: currentWalletIcon ? 'transparent' : '#636366',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {currentWalletIcon ? (
                      <img
                        src={currentWalletIcon}
                        alt={currentWalletName || 'Wallet'}
                        style={{ width: '40px', height: '40px', borderRadius: '0.5rem' }}
                      />
                    ) : (
                      <WalletIcon />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '0.125rem' }}>
                      From
                    </div>
                    <span
                      style={{
                        fontSize: '0.9375rem',
                        fontWeight: 500,
                        color: '#0a84ff',
                      }}
                    >
                      {selectedWallet ? selectedWallet.adapter.name : 'Connect Wallet'}
                    </span>
                  </div>
                  {/* ChevronUpDownIcon */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="#8e8e93"
                    style={{ flexShrink: 0 }}
                  >
                    <path fillRule="evenodd" d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
                  </svg>
                </MenuButton>
                <MenuItems
                  anchor="bottom start"
                  style={{
                    backgroundColor: '#2c2c2e',
                    borderRadius: '0.75rem',
                    padding: '0.25rem',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                    zIndex: 10000,
                    outline: 'none',
                    border: '1px solid #48484a',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    width: 'var(--button-width)',
                    marginTop: '0.25rem',
                  }}
                >
                  {/* Sandbox Accounts Section */}
                  {isSandboxMode && displayedSandboxAccounts.length > 0 && (
                    <>
                      {displayedSandboxAccounts.map((account) => (
                        <MenuItem key={account.id}>
                          {({ focus }) => (
                            <button
                              onClick={() => handleSelectSandboxAccount(account)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.875rem 1rem',
                                backgroundColor: focus ? '#3a3a3c' : 'transparent',
                                borderRadius: '0.5rem',
                                border: 'none',
                                cursor: 'pointer',
                                width: '100%',
                                textAlign: 'left',
                                transition: 'background-color 150ms',
                              }}
                            >
                              <div
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '0.5rem',
                                  backgroundColor: '#636366',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                  color: '#fff',
                                }}
                              >
                                <SandboxIcon />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
                                  <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>
                                    From {truncateAddress(account.address)}
                                  </span>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(account.address);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(account.address);
                                      }
                                    }}
                                    style={{
                                      padding: 0,
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: '#8e8e93',
                                      display: 'flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '0.9375rem',
                                    fontWeight: 500,
                                    color: '#fff',
                                  }}
                                >
                                  {account.name.charAt(0).toUpperCase() + account.name.slice(1)}
                                </span>
                              </div>
                              {account.usdcBalance !== undefined && (
                                <span
                                  style={{
                                    fontSize: '0.6875rem',
                                    color: '#ff9f0a',
                                    backgroundColor: 'rgba(255, 159, 10, 0.15)',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    flexShrink: 0,
                                  }}
                                >
                                  {account.usdcBalance.toLocaleString()} USDC
                                </span>
                              )}
                            </button>
                          )}
                        </MenuItem>
                      ))}
                      {/* Divider between sandbox and browser extensions */}
                      {availableWallets.length > 0 && (
                        <div style={{ height: '1px', backgroundColor: '#48484a', margin: '0.25rem 0' }} />
                      )}
                    </>
                  )}

                  {/* Browser Extension Wallets Section */}
                  {availableWallets.length > 0 ? (
                    availableWallets.map((wallet) => (
                      <MenuItem key={wallet.adapter.name}>
                        {({ focus }) => (
                          <button
                            onClick={() => handleSelectWallet(wallet)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.875rem 1rem',
                              backgroundColor: focus ? '#3a3a3c' : 'transparent',
                              borderRadius: '0.5rem',
                              border: 'none',
                              cursor: 'pointer',
                              width: '100%',
                              textAlign: 'left',
                              transition: 'background-color 150ms',
                            }}
                          >
                            <div
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '0.5rem',
                                backgroundColor: '#636366',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                flexShrink: 0,
                              }}
                            >
                              {wallet.adapter.icon ? (
                                <img
                                  src={wallet.adapter.icon}
                                  alt={wallet.adapter.name}
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '0.5rem',
                                  }}
                                />
                              ) : (
                                <WalletIcon />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '0.125rem' }}>
                                Browser Extension
                              </div>
                              <span
                                style={{
                                  fontSize: '0.9375rem',
                                  fontWeight: 500,
                                  color: '#fff',
                                }}
                              >
                                {wallet.adapter.name}
                              </span>
                            </div>
                            {wallet.readyState === 'Installed' && (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  color: '#30d158',
                                  backgroundColor: 'rgba(48, 209, 88, 0.15)',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  flexShrink: 0,
                                }}
                              >
                                Detected
                              </span>
                            )}
                          </button>
                        )}
                      </MenuItem>
                    ))
                  ) : !isSandboxMode || displayedSandboxAccounts.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '1.5rem',
                        color: '#8e8e93',
                        fontSize: '0.875rem',
                      }}
                    >
                      No wallets detected
                    </div>
                  ) : null}
                </MenuItems>
              </Menu>
            )}

          </div>

          {/* Footer with amount and pay button */}
          <div
            style={{
              padding: '1rem 1.25rem 1.25rem',
              borderTop: '1px solid #3a3a3c',
            }}
          >
            {/* Product name and amount */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#8e8e93', marginBottom: '0.25rem' }}>
                {productName ? `Pay ${productName}` : 'Total'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 600, color: '#fff' }}>
                    {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 500, color: '#8e8e93' }}>
                    {currency}
                  </span>
                </div>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    border: '1.5px solid #8e8e93',
                    background: 'none',
                    color: '#8e8e93',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    fontStyle: 'italic',
                    fontFamily: 'Georgia, serif',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'all 150ms',
                  }}
                  title="Show payment details"
                >
                  i
                </button>
              </div>

              {/* Recipient details (shown when info button is clicked) */}
              {showDetails && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.625rem 0.75rem',
                    backgroundColor: '#3a3a3c',
                    borderRadius: '0.5rem',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8e93' }}>Recipient</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span
                        style={{
                          color: '#fff',
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {truncateAddress(recipient)}
                      </span>
                      <button
                        onClick={() => copyToClipboard(recipient, 'recipient')}
                        style={{
                          padding: 0,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedRecipient ? '#30d158' : '#8e8e93',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pay Button */}
            <button
              onClick={handlePay}
              disabled={!canPay}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: 'none',
                fontSize: '1.0625rem',
                fontWeight: 600,
                cursor: canPay ? 'pointer' : 'not-allowed',
                backgroundColor: canPay ? accentColor : '#48484a',
                color: canPay ? '#fff' : '#8e8e93',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'opacity 150ms',
              }}
            >
              {isSending ? (
                <>
                  <div
                    style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      border: '2px solid currentColor',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  {/* ShieldCheck Heroicon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516 11.209 11.209 0 0 1-7.877-3.08ZM10.28 10.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 0 0-1.06-1.06l-3.22 3.22-1.72-1.72Z" clipRule="evenodd" />
                  </svg>
                  <span>Pay {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
