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
│   ├── react/         # @moneymq/react - React components
│   ├── x402/          # @moneymq/x402 - x402 protocol
│   └── better-auth/   # @moneymq/better-auth - Better Auth plugin
├── scripts/
│   ├── release.js     # Automated release script
│   └── sync-versions.js # Version syncing across packages
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

## Storybook

The `@moneymq/react` package includes Storybook for developing and testing UI components in isolation.

### Running Storybook

```bash
# Start Storybook dev server
pnpm --filter @moneymq/react storybook

# Build static Storybook
pnpm --filter @moneymq/react build-storybook
```

Storybook runs at http://localhost:6006

### Writing Stories

Stories are located in `packages/react/src/stories/`. Each component should have a corresponding `.stories.tsx` file.

Example story:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyComponent } from '../my-component';

const meta = {
  title: 'Components/MyComponent',
  component: MyComponent,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // component props
  },
};
```

### Storybook Configuration

- `.storybook/main.ts` - Storybook configuration
- `.storybook/preview.tsx` - Global decorators and providers
- `.storybook/preview-head.html` - Custom fonts and styles

The preview includes mock providers (MoneyMQ, Sandbox accounts, Wallet) so components can be tested without a running server.

## Release Process

### Automated Release

Use the release script to build, bump version, and publish all public packages:

```bash
# Patch release (0.0.x) - bug fixes
pnpm release:patch

# Minor release (0.x.0) - new features
pnpm release:minor

# Major release (x.0.0) - breaking changes
pnpm release:major
```

The release script will:
1. Build all packages
2. Commit any uncommitted changes
3. Bump the version (syncs across all packages)
4. Publish public packages to npm
5. Push commits and tags to git

### Manual Release

If you need more control:

```bash
# 1. Build all packages
pnpm build

# 2. Bump version (uses npm version which triggers sync-versions.js)
npm version patch|minor|major

# 3. Publish individual packages
cd packages/sdk && pnpm publish --access public
cd packages/react && pnpm publish --access public
cd packages/x402 && pnpm publish --access public
cd packages/better-auth && pnpm publish --access public

# 4. Push to git
git push && git push --tags
```

### Version Syncing

All packages share the same version number. When you run `npm version`, the `sync-versions.js` script automatically updates all package.json files to match.

### Published Packages

- `@moneymq/sdk` - Core SDK
- `@moneymq/react` - React components
- `@moneymq/x402` - x402 protocol utilities
- `@moneymq/better-auth` - Better Auth plugin

## Questions?

Open an issue or start a discussion on GitHub.

Thank you for contributing!
