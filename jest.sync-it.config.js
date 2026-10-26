/**
 * Runs only the live two-phone integration test (src/backend/__tests__/sessionIT.test.ts) in a plain Node environment.
 * The jest-expo preset replaces fetch with a React Native stub that cannot talk to Supabase, so the default config
 * cannot run it. Usage: SYNC_IT=1 npx jest --config jest.sync-it.config.js --forceExit
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/sessionIT.test.ts'],
  transform: { '^.+\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  transformIgnorePatterns: ['node_modules/(?!(@supabase|expo-modules-core)/)'],
};
