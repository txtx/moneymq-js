'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { WalletModal } from './wallet-modal';

export interface Branding {
  logo?: string;
  title?: string;
  description?: string;
  accentColor?: string;
}

interface WalletModalContextState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

const WalletModalContext = createContext<WalletModalContextState>({
  visible: false,
  setVisible: () => {},
});

const BrandingContext = createContext<Branding | undefined>(undefined);

export function useWalletModal() {
  return useContext(WalletModalContext);
}

export function useBranding() {
  return useContext(BrandingContext);
}

export interface CustomWalletModalProviderProps {
  children: React.ReactNode;
  branding?: Branding;
}

export function CustomWalletModalProvider({ children, branding }: CustomWalletModalProviderProps) {
  const [visible, setVisible] = useState(false);

  const handleClose = useCallback(() => setVisible(false), []);

  const contextValue = useMemo(
    () => ({ visible, setVisible }),
    [visible]
  );

  return (
    <BrandingContext.Provider value={branding}>
      <WalletModalContext.Provider value={contextValue}>
        {children}
        <WalletModal visible={visible} onClose={handleClose} branding={branding} />
      </WalletModalContext.Provider>
    </BrandingContext.Provider>
  );
}
