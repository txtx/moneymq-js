'use client';

import React, { forwardRef, useEffect, useState } from 'react';
import { CheckoutModal } from './checkout-modal';
import { useMoneyMQ } from './provider';
import { CheckoutReceipt, type PaymentConfig } from '@moneymq/sdk';

/**
 * Represents a completed payment transaction.
 *
 * @example
 * ```tsx
 * const handleSuccess = (payment: Payment) => {
 *   console.log(`Payment ${payment.id} completed for ${payment.amount} ${payment.currency}`);
 *   console.log(`Transaction signature: ${payment.signature}`);
 * };
 * ```
 */
export interface Payment {
  /** Unique payment identifier (e.g., "pay_1234567890") */
  id: string;
  /** Payment amount in the currency's standard unit (e.g., 9.99 for $9.99) */
  amount: number;
  /** Currency code (e.g., "USDC") */
  currency: string;
  /** Current status of the payment */
  status: 'pending' | 'completed' | 'failed';
  /** Blockchain transaction signature (available after completion) */
  signature?: string;
}

/**
 * Represents a price for a product.
 *
 * @example
 * ```tsx
 * const price: Price = {
 *   id: 'price_abc123',
 *   unit_amount: 999, // $9.99 in cents
 *   currency: 'USDC',
 *   product: 'prod_xyz789',
 * };
 * ```
 */
export interface Price {
  /** Unique price identifier from your catalog */
  id: string;
  /** Price amount in cents (e.g., 999 for $9.99) */
  unit_amount: number;
  /** Currency code (e.g., "USDC") */
  currency: string;
  /** Associated product ID */
  product?: string;
}

/**
 * Represents a product in your catalog.
 *
 * @example
 * ```tsx
 * const product: Product = {
 *   id: 'prod_xyz789',
 *   name: 'Pro Subscription',
 *   description: 'Monthly access to premium features',
 * };
 * ```
 */
export interface Product {
  /** Unique product identifier from your catalog */
  id: string;
  /** Display name shown to the customer */
  name: string;
  /** Optional description for additional context */
  description?: string;
}

/**
 * Represents an item in the checkout basket.
 *
 * @example
 * ```tsx
 * const item: BasketItem = {
 *   product: { id: 'prod_123', name: 'Pro Plan' },
 *   price: { id: 'price_456', unit_amount: 999, currency: 'USDC' },
 *   quantity: 1,
 * };
 * ```
 */
export interface BasketItem {
  /** Product details including id and name */
  product: Product;
  /** Price details including amount and currency */
  price: Price;
  /** Number of items (defaults to 1) */
  quantity?: number;
}

/**
 * Props for the CheckoutButton component.
 *
 * @example
 * ```tsx
 * <CheckoutButton
 *   basket={[{ product, price }]}
 *   onSuccess={(payment) => console.log('Paid!', payment.id)}
 *   onError={(error) => console.error('Failed:', error)}
 *   variant="solid"
 * >
 *   Pay Now
 * </CheckoutButton>
 * ```
 */
export interface CheckoutButtonProps {
  /** Array of items to purchase. Each item includes product, price, and optional quantity. */
  basket: BasketItem[];
  /** Callback fired when payment completes successfully. Receives the Payment object with transaction details. */
  onSuccess?: (payment: Payment) => void;
  /** Callback fired when payment fails. Receives the Error with failure details. */
  onError?: (error: Error) => void;
  /** Button style variant. "solid" has a filled background, "outline" has a border only. @default "solid" */
  variant?: 'solid' | 'outline';
  /** Custom button content. If not provided, displays "Pay". */
  children?: React.ReactNode;
  /** Disable the button, preventing clicks. */
  disabled?: boolean;
  /** Enable debug mode to show a debug panel with account balance in the checkout modal. @default false */
  debug?: boolean;
}

const baseStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  padding: '0.625rem 1rem',
  cursor: 'pointer',
  transition: 'all 200ms',
  border: 'none',
};

const solidStyle: React.CSSProperties = {
  ...baseStyle,
  backgroundColor: '#ec4899',
  color: 'white',
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
};

const outlineStyle: React.CSSProperties = {
  ...baseStyle,
  backgroundColor: 'transparent',
  color: '#ec4899',
  border: '1px solid #ec4899',
};

/**
 * A button component that opens a checkout modal for processing payments.
 *
 * Must be used within a `MoneyMQProvider`. When clicked, displays a modal where
 * users can select their wallet and complete the payment.
 *
 * @example
 * ```tsx
 * import { MoneyMQProvider, CheckoutButton } from '@moneymq/react';
 *
 * function App() {
 *   const product = { id: 'prod_123', name: 'Pro Plan' };
 *   const price = { id: 'price_456', unit_amount: 999, currency: 'USDC' };
 *
 *   return (
 *     <MoneyMQProvider client={client}>
 *       <CheckoutButton
 *         basket={[{ product, price }]}
 *         onSuccess={(payment) => {
 *           console.log('Payment completed:', payment.signature);
 *         }}
 *       >
 *         Subscribe - $9.99
 *       </CheckoutButton>
 *     </MoneyMQProvider>
 *   );
 * }
 * ```
 *
 * @see {@link CheckoutButtonProps} for available props
 * @see {@link CheckoutModal} for the modal component used internally
 */
export const CheckoutButton = forwardRef<HTMLButtonElement, CheckoutButtonProps>(
  function CheckoutButton(
    {
      basket,
      onSuccess,
      onError,
      variant = 'solid',
      children,
      disabled,
      debug = false,
    },
    ref
  ) {
    const client = useMoneyMQ();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Payment data computed from basket
    const [recipient, setRecipient] = useState<string>('');

    // Compute totals from basket
    const { totalAmount, currency, lineItems } = React.useMemo(() => {
      if (!basket || basket.length === 0) {
        return { totalAmount: 0, currency: 'USDC', lineItems: [] };
      }

      // Use the currency from the first item (assuming all items have same currency)
      const baseCurrency = basket[0].price.currency.toUpperCase();

      const items = basket.map((item) => ({
        product: item.product,
        price: item.price,
        quantity: item.quantity ?? 1,
      }));

      const total = items.reduce(
        (sum, item) => sum + (item.price.unit_amount / 100) * item.quantity,
        0
      );

      return {
        totalAmount: total,
        currency: baseCurrency,
        lineItems: items,
      };
    }, [basket]);

    useEffect(() => {
      async function fetchPaymentDetails() {
        setIsLoading(true);
        setError(null);

        try {
          if (!basket || basket.length === 0) {
            // Basket not ready yet, wait for it
            setIsLoading(true);
            return;
          }

          const apiUrl = client.config.endpoint;

          // Fetch payment config to get recipient
          const configResponse = await fetch(`${apiUrl}/payment/v1/config`);
          if (!configResponse.ok) {
            throw new Error(`Failed to fetch config: ${configResponse.status}`);
          }
          const config = (await configResponse.json()) as PaymentConfig;
          if (config.x402?.solana?.payout?.recipientAddress) {
            setRecipient(config.x402.solana.payout.recipientAddress);
          }
        } catch (err) {
          console.error('[CheckoutButton] Error fetching payment details:', err);
          const errorMessage = err instanceof Error ? err.message : 'Failed to load payment details';
          setError(errorMessage);
          onError?.(new Error(errorMessage));
        } finally {
          setIsLoading(false);
        }
      }

      fetchPaymentDetails();
    }, [basket, client.config.endpoint, onError]);

    const handleClick = () => {
      if (!isLoading && !error) {
        setIsModalOpen(true);
      }
    };

    const handlePaymentSuccess = (receipt: CheckoutReceipt) => {
      const paymentDetails = receipt.getPayment();
      const payment: Payment = {
        id: paymentDetails.transactionId,
        amount: totalAmount,
        currency,
        status: 'completed',
        signature: paymentDetails.signature || undefined,
      };
      onSuccess?.(payment);
    };

    const handlePaymentError = (error: Error) => {
      onError?.(error);
    };

    const isDisabled = disabled || isLoading || !!error;

    const buttonStyle: React.CSSProperties = {
      ...(variant === 'outline' ? outlineStyle : solidStyle),
      backgroundColor: variant === 'solid'
        ? (isHovered && !isDisabled ? '#db2777' : '#ec4899')
        : (isHovered && !isDisabled ? 'rgba(236, 72, 153, 0.1)' : 'transparent'),
      opacity: isDisabled ? 0.5 : 1,
      cursor: isDisabled ? 'not-allowed' : 'pointer',
    };

    return (
      <>
        <button
          ref={ref}
          onClick={handleClick}
          disabled={isDisabled}
          style={buttonStyle}
          title={error || undefined}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isLoading ? (
            <span>Loading...</span>
          ) : error ? (
            <span>Error</span>
          ) : (
            children || <span>Pay</span>
          )}
        </button>

        <CheckoutModal
          visible={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          amount={totalAmount}
          currency={currency}
          recipient={recipient}
          lineItems={lineItems}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          debug={debug}
        />
      </>
    );
  }
);
