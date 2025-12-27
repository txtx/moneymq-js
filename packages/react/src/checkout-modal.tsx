'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Wallet } from '@solana/wallet-adapter-react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import { useBranding } from './wallet-modal-provider';
import { useMoneyMQ, useSandbox, type SandboxAccount } from './provider';
import logoAnimation from './assets/logo-animation.json';
import {
  EventStream,
  isPaymentSettlementSucceeded,
  type PaymentSettlementSucceededData,
  type CloudEventEnvelope,
} from '@moneymq/sdk';

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
  headers: Record<string, string> = {},
  useJson: boolean = false,
): Promise<unknown> {
  console.log(`[MoneyMQ] Making ${method} request to ${url}`);

  const contentType = useJson ? 'application/json' : 'application/x-www-form-urlencoded';
  const requestBody = body ? (useJson ? JSON.stringify(body) : encodeFormData(body)) : undefined;

  let response = await fetch(url, {
    method,
    headers: {
      'Content-Type': contentType,
      ...headers,
    },
    body: requestBody,
  });

  let data = await response.json();
  console.log(`[MoneyMQ] Response status: ${response.status}`, data);

  // Handle 402 Payment Required
  if (response.status === 402) {
    // Use x402 standard format (accepts), with fallback for legacy formats
    const paymentRequirements =
      data?.accepts || data?.payment_requirements || data?.error?.payment_requirements || [];

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
    const selectedPaymentRequirement = selectPaymentRequirements(
      paymentRequirements,
      'solana',
      'exact',
    );

    // Create payment header
    const paymentHeaderValue = await createPaymentHeader(
      signer,
      1, // x402Version
      selectedPaymentRequirement,
      {
        svmConfig: {
          rpcUrl,
        },
      },
    );

    // Retry with X-Payment header
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': contentType,
        'X-Payment': paymentHeaderValue,
        ...headers,
      },
      body: requestBody,
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

// Checkout session response type
interface CheckoutSession {
  id: string;
  payment_intent: string;
  client_secret: string;
  status: string;
  line_items: {
    data: Array<{
      id: string;
      price: {
        product: string;
      };
    }>;
  };
}

// Create and confirm checkout session for sandbox accounts (Stripe approach)
async function createSandboxPayment(
  apiUrl: string,
  rpcUrl: string,
  amount: number,
  currency: string,
  recipient: string,
  senderAddress: string,
  secretKeyHex: string,
  lineItems?: LineItem[],
): Promise<string> {
  console.log('[MoneyMQ] Creating checkout session...', {
    amount,
    currency,
    recipient,
    senderAddress,
  });

  // Build line_items array in Stripe Checkout format
  const checkoutLineItems =
    lineItems?.map((item) => ({
      price_data: {
        currency: item.price.currency.toLowerCase(),
        unit_amount: item.price.unit_amount,
        product_data: {
          name: item.product.name,
          description: item.product.description || undefined,
          metadata: {
            product_id: item.product.id,
          },
        },
      },
      quantity: item.quantity,
    })) || [];

  // Step 1: Create checkout session (this creates the payment intent internally)
  // Note: Checkout sessions require JSON, not form-encoded data
  const checkoutSession = (await makeRequestWith402Handling(
    `${apiUrl}/catalog/v1/checkout/sessions`,
    'POST',
    {
      line_items: checkoutLineItems,
      customer: senderAddress,
      metadata: {
        sender_address: senderAddress,
        recipient_address: recipient,
      },
      mode: 'payment',
    },
    secretKeyHex,
    rpcUrl,
    {},
    true, // useJson
  )) as CheckoutSession;

  console.log('[MoneyMQ] Checkout session created:', checkoutSession);

  // Step 2: Confirm the underlying payment intent
  const paymentIntentId = checkoutSession.payment_intent;
  console.log('[MoneyMQ] Confirming payment intent:', paymentIntentId);

  const confirmedIntent = (await makeRequestWith402Handling(
    `${apiUrl}/catalog/v1/payment_intents/${paymentIntentId}/confirm`,
    'POST',
    {},
    secretKeyHex,
    rpcUrl,
  )) as { id: string; status: string };

  console.log('[MoneyMQ] Payment intent confirmed:', confirmedIntent);

  return confirmedIntent.id;
}

// Wait for payment settlement event via SSE stream
function waitForSettlementEvent(
  apiUrl: string,
  paymentIntentId: string,
  timeoutMs: number = 30000,
): Promise<CloudEventEnvelope<PaymentSettlementSucceededData>> {
  return new Promise((resolve, reject) => {
    console.log('[MoneyMQ] Waiting for settlement event for intent:', paymentIntentId);

    const stream = new EventStream(apiUrl, { last: 5 });
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        stream.disconnect();
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Settlement event timeout'));
    }, timeoutMs);

    stream.on('payment', (event) => {
      console.log('[MoneyMQ] Received payment event:', event.type);

      if (isPaymentSettlementSucceeded(event)) {
        // Check if this event matches our payment flow (checkout with this intent_id)
        const { payment_flow } = event.data;
        if (payment_flow.type === 'checkout' && payment_flow.intent_id === paymentIntentId) {
          console.log('[MoneyMQ] Settlement event matched for intent:', paymentIntentId);
          settled = true;
          clearTimeout(timeout);
          stream.disconnect();
          resolve(event);
        }
      }
    });

    stream.on('error', (error) => {
      console.error('[MoneyMQ] Stream error:', error);
      // Don't reject on stream errors, just log - the timeout will handle failures
    });

    stream.connect();
  });
}

// Payment method types
type PaymentMethodType = 'browser_extension' | 'sandbox_account';

interface SelectedPaymentMethod {
  type: PaymentMethodType;
  wallet?: Wallet;
  sandboxAccount?: SandboxAccount;
}

/**
 * Represents a line item in the checkout, including product, price, quantity, and calculated subtotal.
 *
 * @example
 * ```tsx
 * const lineItem: LineItem = {
 *   product: { id: 'prod_123', name: 'Pro Plan' },
 *   price: { id: 'price_456', unit_amount: 999, currency: 'USDC' },
 *   quantity: 2,
 *   subtotal: 19.98,
 * };
 * ```
 */
export interface LineItem {
  /** Product information */
  product: {
    /** Unique product identifier */
    id: string;
    /** Display name shown to the customer */
    name: string;
    /** Optional description */
    description?: string;
  };
  /** Price information */
  price: {
    /** Unique price identifier */
    id: string;
    /** Price amount in cents (e.g., 999 for $9.99) */
    unit_amount: number;
    /** Currency code (e.g., "USDC") */
    currency: string;
  };
  /** Quantity of this item */
  quantity: number;
  /** Calculated subtotal (unit_amount / 100 * quantity) */
  subtotal: number;
}

/**
 * Props for the CheckoutModal component.
 *
 * @example
 * ```tsx
 * <CheckoutModal
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   amount={9.99}
 *   currency="USDC"
 *   recipient="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
 *   onSuccess={(signature) => console.log('Paid:', signature)}
 * />
 * ```
 */
export interface CheckoutModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Total payment amount (e.g., 9.99 for $9.99) */
  amount: number;
  /** Currency code (e.g., "USDC") */
  currency: string;
  /** Recipient wallet address */
  recipient: string;
  /** Optional line items to display in the checkout summary */
  lineItems?: LineItem[];
  /** Callback fired when payment completes. Receives the transaction signature. */
  onSuccess?: (signature: string) => void;
  /** Callback fired when payment fails. Receives the Error with failure details. */
  onError?: (error: Error) => void;
  /** Accent color for UI elements. @default "#ec4899" */
  accentColor?: string;
  /** Enable debug mode to show account balance panel. @default false */
  debug?: boolean;
}

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

/**
 * A modal component for completing payments.
 *
 * Displays a payment interface where users can:
 * - View the total amount and line items
 * - Select a payment method (browser wallet or sandbox account)
 * - Complete the payment transaction
 *
 * Must be used within a `MoneyMQProvider`. Usually used internally by `CheckoutButton`,
 * but can be rendered directly for custom checkout flows.
 *
 * @example
 * ```tsx
 * import { MoneyMQProvider, CheckoutModal } from '@moneymq/react';
 *
 * function CustomCheckout() {
 *   const [isOpen, setIsOpen] = useState(false);
 *
 *   return (
 *     <MoneyMQProvider client={client}>
 *       <button onClick={() => setIsOpen(true)}>Pay</button>
 *       <CheckoutModal
 *         visible={isOpen}
 *         onClose={() => setIsOpen(false)}
 *         amount={9.99}
 *         currency="USDC"
 *         recipient="7xKXtg..."
 *         lineItems={[
 *           {
 *             product: { id: 'prod_1', name: 'Pro Plan' },
 *             price: { id: 'price_1', unit_amount: 999, currency: 'USDC' },
 *             quantity: 1,
 *             subtotal: 9.99,
 *           },
 *         ]}
 *         onSuccess={(signature) => {
 *           console.log('Payment successful:', signature);
 *           setIsOpen(false);
 *         }}
 *       />
 *     </MoneyMQProvider>
 *   );
 * }
 * ```
 *
 * @see {@link CheckoutModalProps} for available props
 * @see {@link CheckoutButton} for a simpler button-based checkout
 */
export function CheckoutModal({
  visible,
  onClose,
  amount,
  currency,
  recipient,
  lineItems,
  onSuccess,
  onError,
  accentColor = '#ec4899',
  debug = false,
}: CheckoutModalProps) {
  const [isSending, setIsSending] = useState(false);
  const [copiedSender, setCopiedSender] = useState(false);
  const [copiedRecipient, setCopiedRecipient] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [accountBalance, setAccountBalance] = useState<number | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SelectedPaymentMethod | null>(
    null,
  );
  const {
    publicKey,
    connected,
    disconnect,
    wallets,
    select,
    wallet: connectedWallet,
  } = useWallet();
  const branding = useBranding();
  const { isSandboxMode, sandboxAccounts } = useSandbox();
  const client = useMoneyMQ();
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  // Animation states
  const [shouldRender, setShouldRender] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'closed' | 'backdrop' | 'open' | 'closing'>(
    'closed',
  );

  // Handle opening animation
  useEffect(() => {
    if (visible && !shouldRender) {
      setShouldRender(true);
      // Start with backdrop animation
      requestAnimationFrame(() => {
        setAnimationPhase('backdrop');
        // Then open modal after backdrop is ready
        setTimeout(() => {
          setAnimationPhase('open');
        }, 150);
      });
    } else if (!visible && shouldRender && animationPhase !== 'closing') {
      // Trigger close animation
      setAnimationPhase('closing');
      // Wait for animation to complete before unmounting
      setTimeout(() => {
        setShouldRender(false);
        setAnimationPhase('closed');
      }, 300);
    }
  }, [visible, shouldRender, animationPhase]);

  const handleAnimatedClose = useCallback(() => {
    if (animationPhase === 'closing') return;
    setAnimationPhase('closing');
    setTimeout(() => {
      setShouldRender(false);
      setAnimationPhase('closed');
      onClose();
    }, 300);
  }, [onClose, animationPhase]);

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
    (wallet) => wallet.readyState === 'Installed' || wallet.readyState === 'Loadable',
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

  // Fetch account balance when debug is enabled and an account is selected
  React.useEffect(() => {
    if (!debug || !currentSelection) {
      setAccountBalance(null);
      return;
    }

    async function fetchBalance() {
      try {
        // For sandbox accounts, use the stored balance
        if (currentSelection?.type === 'sandbox_account' && selectedPaymentMethod?.sandboxAccount) {
          setAccountBalance(selectedPaymentMethod.sandboxAccount.usdcBalance ?? null);
          return;
        }

        // For browser extension wallets, fetch from RPC
        if (currentSelection?.type === 'browser_extension' && publicKey) {
          const apiUrl = normalizeRpcUrl(client.config.endpoint);
          try {
            const configResponse = await fetch(`${apiUrl}/config`);
            const config = await configResponse.json();
            const rpcUrl = normalizeRpcUrl(
              config.x402?.validator?.rpcUrl || 'http://localhost:8899',
            );

            // Fetch USDC token account balance
            const response = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                  publicKey.toBase58(),
                  { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                  { encoding: 'jsonParsed' },
                ],
              }),
            });
            const data = await response.json();
            const usdcAccount = data.result?.value?.find(
              (acc: {
                account: {
                  data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number } } } };
                };
              }) =>
                acc.account.data.parsed.info.mint ===
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
            );
            if (usdcAccount) {
              setAccountBalance(usdcAccount.account.data.parsed.info.tokenAmount.uiAmount);
            } else {
              setAccountBalance(0);
            }
          } catch {
            console.log('[MoneyMQ] Could not fetch balance');
            setAccountBalance(null);
          }
        }
      } catch {
        setAccountBalance(null);
      }
    }

    fetchBalance();
  }, [debug, currentSelection, selectedPaymentMethod, publicKey, client.config.endpoint]);

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
        const apiUrl = normalizeRpcUrl(client.config.endpoint);

        // Fetch RPC URL from config
        let rpcUrl = 'http://localhost:8899';
        try {
          const configResponse = await fetch(`${apiUrl}/config`);
          const config = await configResponse.json();
          rpcUrl = normalizeRpcUrl(config.x402?.validator?.rpcUrl || rpcUrl);
        } catch {
          console.log('[MoneyMQ] Using default RPC URL');
        }

        // Step 1: Create and confirm payment intent
        const paymentIntentId = await createSandboxPayment(
          apiUrl,
          rpcUrl,
          amount,
          currency,
          recipient,
          senderAddress,
          secretKeyHex,
          lineItems,
        );

        // Step 2: Wait for settlement event via stream
        console.log('[MoneyMQ] Payment confirmed, waiting for settlement event...');
        const settlementEvent = await waitForSettlementEvent(apiUrl, paymentIntentId);

        // Extract transaction signature from event
        const signature = settlementEvent.data.transaction_signature || paymentIntentId;

        setIsSending(false);
        onSuccess?.(signature);
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
  }, [
    publicKey,
    recipient,
    amount,
    currency,
    onSuccess,
    onError,
    onClose,
    selectedPaymentMethod,
    client.config.endpoint,
    lineItems,
  ]);

  // Can pay with either browser extension (connected) or sandbox account
  const canPay =
    ((connected && publicKey) || selectedPaymentMethod?.type === 'sandbox_account') &&
    recipient &&
    !isSending;

  // Play Lottie animation every 3 seconds when canPay is true
  useEffect(() => {
    if (!canPay || !visible) return;

    // Play immediately when canPay becomes true
    lottieRef.current?.goToAndPlay(0, true);

    const interval = setInterval(() => {
      lottieRef.current?.goToAndPlay(0, true);
    }, 3000);

    return () => clearInterval(interval);
  }, [canPay, visible]);

  if (!shouldRender) return null;

  // Wallet icon SVG
  const WalletIcon = () => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5z" />
      <path d="M16 12h.01" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  // Sandbox account icon SVG (beaker/test tube)
  const SandboxIcon = () => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23.693L5 15.5m14.8-.2a2.25 2.25 0 0 1 .775 2.646l-.972 2.916a2.25 2.25 0 0 1-2.134 1.538H6.532a2.25 2.25 0 0 1-2.135-1.538l-.971-2.916A2.25 2.25 0 0 1 4.2 15.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  // Wrench/Screwdriver icon for debug mode
  const WrenchIcon = () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M11.42 15.17L17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  // MoneyMQ Logo
  const MoneyMQLogo = () => (
    <svg width="80" height="17" viewBox="0 0 471 99" fill="none">
      <g clipPath="url(#clip0_524_7)">
        <path
          d="M12.8892 77.1417H0V0.637573H14.3415L40.0291 60.1104L65.8075 0.637573H80.149V77.1417H67.169V25.5014L44.9306 77.2327H35.0368L12.8892 25.5014V77.2327V77.1417Z"
          fill="white"
        />
        <path
          d="M113.28 77.9614C108.015 77.9614 103.295 76.7774 99.2104 74.5005C95.1257 72.2235 91.8581 68.9448 89.5888 64.7553C87.2289 60.5658 86.1396 55.6476 86.1396 49.9098C86.1396 44.172 87.3196 39.1628 89.7704 34.9733C92.2211 30.7838 95.4888 27.5051 99.6642 25.2281C103.84 22.9512 108.56 21.7673 113.733 21.7673C118.907 21.7673 123.627 22.9512 127.803 25.2281C131.978 27.5051 135.336 30.7838 137.787 34.9733C140.238 39.1628 141.509 44.081 141.509 49.8188C141.509 55.5566 140.238 60.5658 137.787 64.7553C135.246 68.9448 131.887 72.2235 127.621 74.5005C123.355 76.7774 118.635 77.9614 113.37 77.9614H113.28ZM113.189 66.9411C115.73 66.9411 118.181 66.3036 120.45 65.1196C122.72 63.8445 124.626 62.023 126.078 59.4729C127.53 56.9227 128.257 53.735 128.257 49.8188C128.257 45.9025 127.53 42.897 126.169 40.3468C124.807 37.7967 122.992 35.9752 120.723 34.7001C118.453 33.425 116.003 32.8786 113.461 32.8786C110.92 32.8786 108.56 33.5161 106.381 34.7001C104.203 35.9752 102.478 37.7967 101.207 40.3468C99.9365 42.897 99.3011 46.0846 99.3011 50.0009C99.3011 53.9172 99.9365 56.9227 101.117 59.4729C102.387 62.023 104.021 63.8445 106.2 65.1196C108.378 66.3947 110.647 66.9411 113.189 66.9411Z"
          fill="white"
        />
        <path
          d="M146.41 22.4959H157.484L158.392 27.8694C160.207 25.9568 162.386 24.4995 164.927 23.4066C167.469 22.3137 170.192 21.7673 173.096 21.7673C177.272 21.7673 180.993 22.678 184.079 24.4085C187.166 26.23 189.526 28.7801 191.25 32.241C192.884 35.7019 193.792 39.9825 193.792 45.1739V77.0506H181.356V46.9043C181.356 42.2594 180.449 38.7075 178.633 36.4305C176.818 34.1536 174.095 32.9696 170.373 32.9696C166.652 32.9696 163.747 34.1536 161.75 36.5216C159.753 38.8896 158.846 42.4416 158.846 47.0865V77.1417H146.501V22.4959H146.41Z"
          fill="white"
        />
        <path
          d="M225.107 77.9614C219.661 77.9614 214.85 76.7774 210.765 74.3183C206.681 71.8592 203.504 68.5805 201.144 64.2999C198.875 60.0193 197.695 55.0101 197.695 49.4545C197.695 44.172 198.784 39.4361 201.053 35.2466C203.322 31.057 206.409 27.7783 210.402 25.4103C214.396 23.0423 218.935 21.7673 223.927 21.7673C228.919 21.7673 233.73 22.8602 237.633 25.1371C241.536 27.414 244.622 30.5106 246.892 34.609C249.161 38.6164 250.25 43.3523 250.25 48.6348C250.25 49.5455 250.25 50.4563 250.068 51.4581C249.978 52.46 249.796 53.4618 249.705 54.5547H211.038C211.31 57.1959 212.127 59.3818 213.398 61.2033C214.669 63.0248 216.302 64.4821 218.209 65.4839C220.205 66.4857 222.475 67.0322 225.107 67.0322C228.102 67.0322 230.825 66.3947 233.185 65.1196C235.636 63.8445 237.27 62.2051 238.268 60.2925L249.07 63.9356C246.892 68.3073 243.715 71.7682 239.448 74.2272C235.182 76.6863 230.372 77.9614 225.016 77.9614H225.107ZM236.816 44.5363C236.816 42.2594 236.272 40.2557 235.092 38.4342C233.912 36.6127 232.368 35.1555 230.553 34.1536C228.647 33.0607 226.559 32.6053 224.199 32.6053C222.112 32.6053 220.115 33.1518 218.39 34.1536C216.575 35.1555 215.122 36.6127 213.852 38.3431C212.581 40.1647 211.764 42.2594 211.31 44.6274H236.816V44.5363Z"
          fill="white"
        />
        <path
          d="M291.368 22.4958H304.439L272.398 99H260.235L270.038 75.5022L248.707 22.4958H262.413L276.754 61.2033L291.368 22.4958Z"
          fill="white"
        />
        <path
          d="M320.687 77.1417H307.797V0.637573H322.139L347.827 60.1104L373.605 0.637573H387.946V77.1417H374.966V25.5014L352.728 77.2327H342.834L320.596 25.5014V77.2327L320.687 77.1417Z"
          fill="white"
        />
        <path
          d="M432.332 77.9614C426.977 77.9614 421.894 77.0506 417.174 75.138C412.454 73.2254 408.369 70.5842 404.829 67.1233C401.289 63.6624 398.566 59.5639 396.569 54.7369C394.573 50.0009 393.574 44.7185 393.574 38.9807C393.574 33.2429 394.573 28.0515 396.569 23.3155C398.566 18.5796 401.289 14.3901 404.829 10.9292C408.369 7.46826 412.454 4.73597 417.174 2.82337C421.894 0.910764 426.886 0 432.332 0C437.779 0 442.771 0.910764 447.4 2.82337C452.029 4.73597 456.205 7.37719 459.745 10.9292C463.285 14.3901 466.008 18.5796 468.005 23.3155C470.002 28.0515 471 33.3339 471 38.9807C471 44.6274 470.002 50.0009 468.095 54.7369C466.098 59.4729 463.375 63.6624 459.835 67.1233C456.295 70.5842 452.12 73.2254 447.491 75.138C442.862 77.0506 437.779 77.9614 432.423 77.9614H432.332ZM432.242 66.9411C437.143 66.9411 441.591 65.7571 445.403 63.4802C449.215 61.2033 452.302 57.9246 454.571 53.735C456.84 49.5455 457.929 44.6274 457.929 38.8896C457.929 33.1518 456.84 28.1426 454.571 24.0442C452.302 19.9457 449.306 16.667 445.403 14.3901C441.591 12.1132 437.143 10.9292 432.242 10.9292C427.34 10.9292 422.892 12.1132 419.08 14.3901C415.268 16.667 412.182 19.9457 410.003 24.0442C407.825 28.1426 406.736 33.1518 406.736 38.8896C406.736 44.6274 407.825 49.5455 410.094 53.735C412.273 57.9246 415.359 61.2033 419.171 63.4802C422.983 65.7571 427.34 66.9411 432.332 66.9411H432.242ZM426.251 55.0101H438.868V87.9798H426.251V55.0101Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="clip0_524_7">
          <rect width="471" height="99" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );

  // Compute animation styles
  const isBackdropVisible = animationPhase === 'backdrop' || animationPhase === 'open';
  const isModalVisible = animationPhase === 'open';
  const isClosing = animationPhase === 'closing';

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
          backgroundColor:
            isBackdropVisible && !isClosing ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0)',
          backdropFilter: isBackdropVisible && !isClosing ? 'blur(8px)' : 'blur(0px)',
          transition:
            'background-color 250ms cubic-bezier(0.4, 0, 0.2, 1), backdrop-filter 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={handleAnimatedClose}
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
          pointerEvents: isClosing ? 'none' : 'auto',
        }}
        onClick={handleAnimatedClose}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '380px',
            backgroundColor: '#2c2c2e',
            borderRadius: '1rem',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            opacity: isModalVisible && !isClosing ? 1 : 0,
            transform:
              isModalVisible && !isClosing
                ? 'translateY(0) scale(1)'
                : 'translateY(-20px) scale(0.98)',
            transition:
              'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {branding?.logo ? (
                <img
                  src={branding.logo}
                  alt="Logo"
                  style={{ height: '24px', width: 'auto', filter: 'invert(1)' }}
                />
              ) : (
                <MoneyMQLogo />
              )}
              {isSandboxMode && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#ff9f0a',
                    position: 'relative',
                    top: '-1px',
                  }}
                >
                  {'{ sandbox }'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {debug && (
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: showDebug ? 'rgba(255, 159, 10, 0.2)' : '#3a3a3c',
                    color: showDebug ? '#ff9f0a' : '#8e8e93',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'all 150ms',
                  }}
                  title="Debug info"
                >
                  <WrenchIcon />
                </button>
              )}
              <button
                onClick={handleAnimatedClose}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: '#8e8e93',
                  backgroundColor: '#3a3a3c',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                cancel
              </button>
            </div>
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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        marginBottom: '0.125rem',
                      }}
                    >
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
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
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
                      backgroundColor: 'rgba(255, 69, 58, 0.15)',
                      borderRadius: '9999px',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.25rem 0.625rem',
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
                    <div
                      style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '0.125rem' }}
                    >
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
                    <path
                      fillRule="evenodd"
                      d="M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06ZM10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z"
                      clipRule="evenodd"
                    />
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
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.375rem',
                                    marginBottom: '0.125rem',
                                  }}
                                >
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
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
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
                        <div
                          style={{ height: '1px', backgroundColor: '#48484a', margin: '0.25rem 0' }}
                        />
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
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: '#8e8e93',
                                  marginBottom: '0.125rem',
                                }}
                              >
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
            {/* Line items and amount */}
            <div style={{ marginBottom: '1rem' }}>
              {/* Line items list */}
              {lineItems && lineItems.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  {lineItems.map((item, index) => (
                    <div
                      key={item.product.id + '-' + index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem 0',
                        borderBottom: index < lineItems.length - 1 ? '1px solid #3a3a3c' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                          {item.product.name}
                        </div>
                        {item.quantity > 1 && (
                          <div style={{ fontSize: '0.75rem', color: '#8e8e93' }}>
                            Qty: {item.quantity} ×{' '}
                            {(item.price.unit_amount / 100).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            {item.price.currency.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#fff', fontWeight: 500 }}>
                        {item.subtotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {item.price.currency.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: '0.875rem', color: '#8e8e93', marginBottom: '0.25rem' }}>
                Total
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 600, color: '#fff' }}>
                    {amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
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
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Debug section (shown when wrench button is clicked) */}
              {showDebug && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: '#1c1c1e',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      paddingBottom: '0.5rem',
                      borderBottom: '1px solid #2c2c2e',
                    }}
                  >
                    <span style={{ color: '#8e8e93' }}>DEBUG</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ color: '#8e8e93' }}>balance</span>
                    <span style={{ color: '#30d158' }}>
                      {accountBalance !== null
                        ? `${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
                        : currentSelection
                          ? '...'
                          : 'null'}
                    </span>
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
                padding: '0.5rem 1rem',
                borderRadius: '0.75rem',
                border: 'none',
                fontSize: '1.0625rem',
                fontWeight: 600,
                cursor: canPay ? 'pointer' : 'not-allowed',
                backgroundColor: canPay ? '#000' : '#48484a',
                color: canPay ? '#fff' : '#8e8e93',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
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
                  <Lottie
                    lottieRef={lottieRef}
                    animationData={logoAnimation}
                    loop={false}
                    autoplay={false}
                    style={{
                      width: 48,
                      height: 48,
                      marginTop: '-8px',
                      marginBottom: '-8px',
                      marginLeft: '-8px',
                      marginRight: '4px',
                      opacity: canPay ? 1 : 0.55,
                      transition: 'opacity 150ms',
                    }}
                  />
                  <span>
                    Pay{' '}
                    {amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
