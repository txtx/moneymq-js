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

interface PriceDetails {
  id: string;
  unit_amount: number;
  currency: string;
  product: string;
}

interface ProductDetails {
  id: string;
  name: string;
  description?: string;
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

export interface PayButtonProps {
  /** Price ID to fetch details from API */
  priceId?: string;
  /** Price object (alternative to priceId) */
  price?: Price;
  /** Product object */
  product?: Product;
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
      priceId,
      price: priceObject,
      product: productObject,
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

    // Check if price object is provided directly
    const hasPriceObject = priceObject !== undefined;

    const [isLoading, setIsLoading] = useState(!hasPriceObject);
    const [error, setError] = useState<string | null>(null);

    // Payment data (unit_amount is in cents)
    const [amount, setAmount] = useState<number>(hasPriceObject ? priceObject.unit_amount / 100 : 0);
    const [currency, setCurrency] = useState<string>(hasPriceObject ? priceObject.currency.toUpperCase() : 'USDC');
    const [recipient, setRecipient] = useState<string>('');
    const [productName, setProductName] = useState<string | undefined>(productObject?.name);

    useEffect(() => {
      async function fetchPaymentDetails() {
        setIsLoading(true);
        setError(null);

        try {
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

          // If price object provided, use it directly
          if (hasPriceObject) {
            setAmount(priceObject.unit_amount / 100);
            setCurrency(priceObject.currency.toUpperCase());

            // Use product object if provided, otherwise fetch
            if (productObject) {
              setProductName(productObject.name);
            } else if (priceObject.product) {
              try {
                const productResponse = await fetch(`${apiUrl}/catalog/v1/products/${priceObject.product}`);
                if (productResponse.ok) {
                  const product = (await productResponse.json()) as ProductDetails;
                  setProductName(product.name);
                }
              } catch {
                // Product fetch is optional, ignore errors
              }
            }
          } else if (priceId) {
            // Fetch price details by ID
            const priceResponse = await fetch(`${apiUrl}/catalog/v1/prices/${priceId}`);
            if (!priceResponse.ok) {
              throw new Error(`Failed to fetch price: ${priceResponse.status}`);
            }
            const price = (await priceResponse.json()) as PriceDetails;
            setAmount(price.unit_amount / 100);
            setCurrency(price.currency.toUpperCase());

            // Fetch product details if available
            if (price.product) {
              try {
                const productResponse = await fetch(`${apiUrl}/catalog/v1/products/${price.product}`);
                if (productResponse.ok) {
                  const product = (await productResponse.json()) as ProductDetails;
                  setProductName(product.name);
                }
              } catch {
                // Product fetch is optional, ignore errors
              }
            }
          } else {
            throw new Error('Either priceId or price object is required');
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
    }, [priceId, priceObject, productObject, client.config.endpoint, onError, hasPriceObject]);

    const handleClick = () => {
      if (!isLoading && !error) {
        setIsModalOpen(true);
      }
    };

    const handlePaymentSuccess = (signature: string) => {
      const payment: Payment = {
        id: `pay_${Date.now()}`,
        amount,
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
          amount={amount}
          currency={currency}
          recipient={recipient}
          productName={productName}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      </>
    );
  }
);
