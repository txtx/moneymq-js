'use client';

import React, { forwardRef, useEffect, useState } from 'react';
import { PaymentModal } from './payment-modal';
import { useMoneyMQ } from './provider';

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  signature?: string;
}

interface ServerConfig {
  x402?: {
    payoutAccount?: {
      address?: string;
      currency?: string;
    };
  };
}

export interface Price {
  id: string;
  unit_amount: number;
  currency: string;
  product?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
}

export interface BasketItem {
  /** Product details */
  product: Product;
  /** Price details */
  price: Price;
  /** Quantity (defaults to 1) */
  quantity?: number;
}

export interface PayButtonProps {
  /** Basket of items to purchase */
  basket: BasketItem[];
  onSuccess?: (payment: Payment) => void;
  onError?: (error: Error) => void;
  variant?: 'solid' | 'outline';
  children?: React.ReactNode;
  disabled?: boolean;
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

export const PayButton = forwardRef<HTMLButtonElement, PayButtonProps>(
  function PayButton(
    {
      basket,
      onSuccess,
      onError,
      variant = 'solid',
      children,
      disabled,
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
        subtotal: (item.price.unit_amount / 100) * (item.quantity ?? 1),
      }));

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

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
            throw new Error('Basket is empty');
          }

          const apiUrl = client.config.endpoint;

          // Fetch server config to get recipient
          const configResponse = await fetch(`${apiUrl}/config`);
          if (!configResponse.ok) {
            throw new Error(`Failed to fetch config: ${configResponse.status}`);
          }
          const config = (await configResponse.json()) as ServerConfig;
          if (config.x402?.payoutAccount?.address) {
            setRecipient(config.x402.payoutAccount.address);
          }
        } catch (err) {
          console.error('[PayButton] Error fetching payment details:', err);
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

    const handlePaymentSuccess = (signature: string) => {
      const payment: Payment = {
        id: `pay_${Date.now()}`,
        amount: totalAmount,
        currency,
        status: 'completed',
        signature,
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

        <PaymentModal
          visible={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          amount={totalAmount}
          currency={currency}
          recipient={recipient}
          lineItems={lineItems}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      </>
    );
  }
);
