/**
 * Compute a deterministic channel ID from a Solana transaction.
 *
 * This function hashes the transaction bytes to produce a consistent ID
 * that can be computed by both frontend and backend:
 * - Frontend: Hash the unsigned transaction message before signing
 * - Backend: Extract message bytes from signed transaction and hash
 *
 * The frontend should call this with the unsigned transaction (which IS the message bytes)
 * before sending the payment, then subscribe to the channel to receive events.
 *
 * @param transaction - Base64 or Base58 encoded unsigned Solana transaction
 * @returns Promise<string> - Hex-encoded SHA256 hash to use as channel ID
 *
 * @example
 * ```typescript
 * import { computeChannelId } from '@moneymq/sdk';
 *
 * // After building but before signing the transaction
 * const unsignedTxBase64 = transaction.serializeMessage().toString('base64');
 * const channelId = await computeChannelId(unsignedTxBase64);
 *
 * // Subscribe to channel before sending payment
 * const receiver = moneymq.channels.receiver(channelId);
 * receiver.on('event', (event) => {
 *   if (event.type === 'transaction:completed') {
 *     const credentials = event.data.credentials;
 *     // Use credentials for S3 upload
 *   }
 * });
 * await receiver.connect();
 *
 * // Now sign and send the payment
 * const signedTx = await wallet.signTransaction(transaction);
 * // ... send with X-Payment header
 * ```
 */
import bs58 from 'bs58';

export async function computeChannelId(transaction: string): Promise<string> {
  // Decode the transaction from base64 or base58
  let bytes: Uint8Array;

  // Try base64 first (more common in web contexts)
  try {
    // Check if it looks like base64 (contains +, /, or = which aren't in base58)
    if (transaction.includes('+') || transaction.includes('/') || transaction.includes('=')) {
      bytes = Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0));
    } else {
      // Try base58 decode
      bytes = bs58.decode(transaction);
    }
  } catch {
    // If base64 fails, try base58
    try {
      bytes = bs58.decode(transaction);
    } catch {
      throw new Error('Failed to decode transaction: not valid base64 or base58');
    }
  }

  // Hash the bytes using Web Crypto API (available in browsers and Node.js 16+)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to hex string
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
