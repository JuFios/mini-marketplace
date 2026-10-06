import type { StorybookConfig } from '@storybook/react-vite';

// Storybook runs on its own (`npm run storybook`) and is built separately from the app; the
// app's vite.config.ts (React, Tailwind, the `@/` alias) is picked up automatically.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  core: { disableTelemetry: true },
};

export default config;
