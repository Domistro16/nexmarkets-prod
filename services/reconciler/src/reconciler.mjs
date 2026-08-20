const CHECKS = Object.freeze([
  'edition','totalMinted','owner','tokenTerms','activeTerms','advantage','listing','royalty','withdrawal','tba'
]);

async function retry(operation, { attempts = 3, onRetry = () => {} } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(attempt); } catch (error) {
      last = error;
      if (attempt < attempts) await onRetry({ attempt, error });
    }
  }
  throw last;
}

export class ReconciliationService {
  constructor({ chain, projections, evidenceStore, attempts = 3, logger = { info() {}, error() {} }, metrics = { increment() {}, set() {} } }) {
    this.chain = chain;
    this.projections = projections;
    this.evidenceStore = evidenceStore;
    this.attempts = attempts;
    this.logger = logger;
    this.metrics = metrics;
  }

  async run(scope) {
    const run = await this.evidenceStore.startRun(scope);
    const discrepancies = []; let checkedCount = 0;
    for (const item of await this.projections.items(scope)) {
      for (const check of CHECKS) {
        if (!(check in item.expected) || typeof this.chain[check] !== 'function') continue;
        checkedCount += 1;
        try {
          const observed = await retry(() => this.chain[check](item.identity), { attempts: this.attempts });
          if (JSON.stringify(observed) !== JSON.stringify(item.expected[check])) {
            const incident = {
              runId: run.id,
              authority: item.authority[check],
              objectKey: item.key,
              check,
              expected: item.expected[check],
              observed,
              repairAction: item.repair?.[check] ?? 'REPORT_ONLY'
            };
            discrepancies.push(incident);
            await this.evidenceStore.recordIncident(incident);
          }
        } catch (error) {
          const incident = {
            runId: run.id,
            authority: item.authority[check],
            objectKey: item.key,
            check,
            expected: item.expected[check],
            observed: null,
            error: error.message,
            repairAction: 'RETRY_EXHAUSTED_REPORT_ONLY'
          };
          discrepancies.push(incident);
          await this.evidenceStore.recordIncident(incident);
        }
      }
    }
    const result = { runId: run.id, checkedAt: new Date().toISOString(), checkedCount, discrepancies };
    await this.evidenceStore.finishRun(run.id, discrepancies.length ? 'PARTIAL' : 'SUCCEEDED', result);
    if (discrepancies.length) this.metrics.increment('nexmarkets_reconciliation_errors_total', discrepancies.length);
    this.logger.info({ event: 'reconciliation_complete', runId: run.id, discrepancyCount: discrepancies.length });
    return result;
  }
}

export { retry as boundedRetry };
