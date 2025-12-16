# Contributing to MoneyMQ JS

Thank you for your interest in contributing to MoneyMQ! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build great software together.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/moneymq-js.git
   cd moneymq-js
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build all packages:
   ```bash
   pnpm build
   ```
5. Run tests:
   ```bash
   pnpm test
   ```

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

### Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make your changes

3. Ensure tests pass:
   ```bash
   pnpm test
   ```

4. Ensure linting passes:
   ```bash
   pnpm lint
   ```

5. Format your code:
   ```bash
   pnpm format
   ```

6. Commit your changes with a clear message:
   ```bash
   git commit -m "feat: add new feature description"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Build process or auxiliary tool changes

### Pull Requests

1. Push your branch to your fork
2. Open a Pull Request against `main`
3. Fill out the PR template
4. Wait for review

## Project Structure

```
moneymq-js/
├── packages/
│   ├── sdk/           # @moneymq/sdk - Core SDK
│   │   ├── src/
│   │   │   ├── client.ts      # Main MoneyMQ client
│   │   │   ├── catalog.ts     # Products & Prices API
│   │   │   ├── payment.ts     # Payment API
│   │   │   └── *.test.ts      # Tests
│   │   └── package.json
│   │
│   └── x402/          # @moneymq/x402 - x402 protocol
│       ├── src/
│       │   ├── payUpon402.ts       # Client-side handler
│       │   ├── middleware.ts       # Express middleware
│       │   ├── createStripeClient.ts # Stripe integration
│       │   └── *.test.ts           # Tests
│       └── package.json
│
├── vitest.config.ts   # Test configuration
├── eslint.config.mjs  # Linting configuration
├── prettier.config.mjs # Formatting configuration
└── turbo.json         # Build orchestration
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Writing Tests

- Place test files next to the source files with `.test.ts` extension
- Use descriptive test names
- Test both success and error cases
- Maintain >80% coverage

Example:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from './myModule';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow('Invalid input');
  });
});
```

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Documentation

- Update README if adding new features
- Add JSDoc comments to new exports
- Include code examples where helpful

## Questions?

Open an issue or start a discussion on GitHub.

Thank you for contributing!
