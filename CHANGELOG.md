# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-16

### Added

#### @moneymq/sdk
- Initial release of the MoneyMQ SDK
- `MoneyMQ` client class for API interactions
- Catalog API for managing products and prices
- Payment API for checkout sessions, payment links, customers, and payouts
- Full TypeScript support with exported types
- Comprehensive test coverage

#### @moneymq/x402
- Initial release of x402 protocol utilities
- `payUpon402` function for client-side 402 handling
- `createX402Handler` Express middleware for server-side payment gates
- `requirePayment` shorthand middleware
- `createStripeClient` for Stripe SDK integration with x402
- Re-exported x402 utilities (`createSigner`, `createPaymentHeader`, etc.)
- Full TypeScript support
