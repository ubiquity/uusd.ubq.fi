import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/main.ts"],
  project: ["src/**/*.ts"],
  ignore: ["src/types/config.ts", "src/scripts/custom-chains.ts", "**/__mocks__/**", "**/__fixtures__/**", "cypress/scripts/*.sh"],
  ignoreExportsUsedInFile: true,
  // eslint can also be safely ignored as per the docs: https://knip.dev/guides/handling-issues#eslint--jest
  ignoreDependencies: ["eslint-config-prettier", "eslint-plugin-prettier", "@types/jest", "@mswjs/data", "@jest/globals"],
  ignoreBinaries: ["cypress/scripts/anvil.sh", "cypress/scripts/fund.sh", "cypress/scripts/increase-uusd-thresholds.sh"],
  eslint: true,
};

export default config;
