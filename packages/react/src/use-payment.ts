'use client';

import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from './wallet-modal-provider';

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  signature?: string;
}

export interface UsePaymentReturn {
  pay: (priceId: string) => Promise<Payment | null>;
  isPending: boolean;
  lastPayment: Payment | null;
}

export function usePayment(): UsePaymentReturn {
  const [isPending, setIsPending] = useState(false);
  const [lastPayment, setLastPayment] = useState<Payment | null>(null);
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const pay = useCallback(async (priceId: string): Promise<Payment | null> => {
    // If not connected, open wallet modal
    if (!connected || !publicKey) {
      setVisible(true);
      return null;
    }

    setIsPending(true);

    try {
      const event = new CustomEvent('moneymq:pay', {
        detail: { priceId, publicKey: publicKey.toBase58() },
        bubbles: true,
      });
      window.dispatchEvent(event);

      const result = await new Promise<Payment>((resolve, reject) => {
        const handleSuccess = (e: Event) => {
          const customEvent = e as CustomEvent<Payment>;
          cleanup();
          resolve(customEvent.detail);
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

      setLastPayment(result);
      return result;
    } catch {
      return null;
    } finally {
      setIsPending(false);
    }
  }, [connected, publicKey, setVisible]);

  return { pay, isPending, lastPayment };
}
