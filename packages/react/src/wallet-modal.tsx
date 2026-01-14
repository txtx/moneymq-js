'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnector } from '@solana/connector';

type ConnectorWallet = ReturnType<typeof useConnector>['wallets'][number];

export interface WalletModalProps {
  visible: boolean;
  onClose: () => void;
  branding?: {
    logo?: string;
    title?: string;
    description?: string;
    accentColor?: string;
  };
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  animation: 'fadeIn 150ms ease-out',
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#18181b',
  borderRadius: '1rem',
  padding: '1.5rem',
  width: '100%',
  maxWidth: '400px',
  maxHeight: '90vh',
  overflow: 'auto',
  border: '1px solid #27272a',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  animation: 'slideUp 150ms ease-out',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  marginBottom: '0.5rem',
};

const logoStyle: React.CSSProperties = {
  width: '2.5rem',
  height: '2.5rem',
  borderRadius: '0.5rem',
  objectFit: 'contain',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  color: '#fafafa',
  margin: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#a1a1aa',
  marginBottom: '1.5rem',
};

const walletListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const walletButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  width: '100%',
  padding: '0.875rem 1rem',
  backgroundColor: '#27272a',
  border: '1px solid #3f3f46',
  borderRadius: '0.75rem',
  cursor: 'pointer',
  transition: 'all 150ms',
  textAlign: 'left',
};

const walletIconStyle: React.CSSProperties = {
  width: '2rem',
  height: '2rem',
  borderRadius: '0.375rem',
};

const walletNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.9375rem',
  fontWeight: 500,
  color: '#fafafa',
};

const walletTagStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.25rem 0.5rem',
  borderRadius: '9999px',
  backgroundColor: '#3f3f46',
  color: '#a1a1aa',
};

const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '1rem',
  right: '1rem',
  padding: '0.5rem',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  color: '#71717a',
  transition: 'color 150ms',
};

const noWalletsStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '2rem 1rem',
  color: '#a1a1aa',
  fontSize: '0.875rem',
};

export function WalletModal({ visible, onClose, branding }: WalletModalProps) {
  const { wallets, select, selectedWallet, connected } = useConnector();
  const [hoveredWallet, setHoveredWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const accentColor = branding?.accentColor || '#ec4899';

  // Helper to check if a wallet is the connected one
  const isWalletConnected = useCallback((wallet: ConnectorWallet) => {
    return connected && selectedWallet?.name === wallet.wallet.name;
  }, [connected, selectedWallet]);

  // Sort wallets - connected first, then by name
  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const aConnected = isWalletConnected(a);
      const bConnected = isWalletConnected(b);
      if (aConnected && !bConnected) return -1;
      if (!aConnected && bConnected) return 1;
      return a.wallet.name.localeCompare(b.wallet.name);
    });
  }, [wallets, isWalletConnected]);

  const handleSelect = useCallback(async (wallet: ConnectorWallet) => {
    setConnecting(true);
    try {
      await select(wallet.wallet.name);
      onClose();
    } finally {
      setConnecting(false);
    }
  }, [select, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (visible) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={overlayStyle} onClick={onClose}>
        <div
          style={{ ...modalStyle, position: 'relative' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            style={closeButtonStyle}
            onClick={onClose}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fafafa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#71717a')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div style={headerStyle}>
            {branding?.logo && (
              <img src={branding.logo} alt="" style={logoStyle} />
            )}
            <h2 style={titleStyle}>
              {branding?.title || 'Connect Wallet'}
            </h2>
          </div>

          {/* Description */}
          <p style={descriptionStyle}>
            {branding?.description || 'Select a wallet to connect and pay securely.'}
          </p>

          {/* Wallet list */}
          <div style={walletListStyle}>
            {sortedWallets.length === 0 ? (
              <div style={noWalletsStyle}>
                No wallets found. Please install a Solana wallet extension.
              </div>
            ) : (
              sortedWallets.map((wallet) => {
                const isHovered = hoveredWallet === wallet.wallet.name;

                return (
                  <button
                    key={wallet.wallet.name}
                    style={{
                      ...walletButtonStyle,
                      backgroundColor: isHovered ? '#3f3f46' : '#27272a',
                      borderColor: isHovered ? accentColor : '#3f3f46',
                    }}
                    onClick={() => handleSelect(wallet)}
                    onMouseEnter={() => setHoveredWallet(wallet.wallet.name)}
                    onMouseLeave={() => setHoveredWallet(null)}
                    disabled={connecting}
                  >
                    <img
                      src={wallet.wallet.icon}
                      alt={wallet.wallet.name}
                      style={walletIconStyle}
                    />
                    <span style={walletNameStyle}>{wallet.wallet.name}</span>
                    {isWalletConnected(wallet) ? (
                      <span style={{ ...walletTagStyle, backgroundColor: accentColor + '20', color: accentColor }}>
                        Connected
                      </span>
                    ) : (
                      <span style={{ ...walletTagStyle, backgroundColor: accentColor + '20', color: accentColor }}>
                        Detected
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
