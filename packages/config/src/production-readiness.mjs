export const PRODUCTION_READINESS_GATES = Object.freeze([
  'databaseMigrationVerified',
  'contractConfigVerified',
  'paymentTokenVerified',
  'testnetE2EPassed',
  'securityGatePassed',
  'criticalTestsPassed'
]);

export function evaluateProductionReadiness(input = {}) {
  const gates = Object.fromEntries(PRODUCTION_READINESS_GATES.map((name) => [name, input[name] === true]));
  const blockers = PRODUCTION_READINESS_GATES.filter((name) => !gates[name]);
  return { gates, blockers, productionReady: blockers.length === 0 };
}

export function productionReadinessFromEnv(env = process.env) {
  return evaluateProductionReadiness({
    databaseMigrationVerified: env.NEXMARKETS_DATABASE_MIGRATION_VERIFIED === 'true',
    contractConfigVerified: env.NEXMARKETS_CONTRACT_CONFIG_VERIFIED === 'true',
    paymentTokenVerified: env.NEXMARKETS_PAYMENT_TOKEN_VERIFIED === 'true',
    testnetE2EPassed: env.NEXMARKETS_TESTNET_E2E_PASSED === 'true',
    securityGatePassed: env.NEXMARKETS_SECURITY_GATE_PASSED === 'true',
    criticalTestsPassed: env.NEXMARKETS_CRITICAL_TESTS_PASSED === 'true'
  });
}
