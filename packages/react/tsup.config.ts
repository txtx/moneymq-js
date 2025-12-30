import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'browser',
  external: [
    'react',
    'react-dom',
    '@headlessui/react',
  ],
  // Bundle these for better DX - consumers don't need to install them
  noExternal: ['@lottiefiles/dotlottie-react', '@solana/connector'],
});
