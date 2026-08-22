const CHECKS = Object.freeze([
  'edition','totalMinted','owner','tokenTerms','activeTerms','advantage','listing','royalty','withdrawal','tba'
]);

function equivalent(check, expected, observed) {
  if (check !== 'advantage') return JSON.stringify(observed) === JSON.stringify(expected);
  if (expected?.kind !== 'TIME_BASED') return Boolean(expected?.listed) === Boolean(observed?.listed) && String(expected?.remaining) === String(observed?.remaining);
  // TimeBased remaining is a live countdown and the two reads may straddle
  // one or two Robinhood blocks. Keep the listed bit exact and allow only a
  // bounded wall-clock drift; all other Advantage kinds remain exact.
  if (Boolean(expected.listed) !== Boolean(observed?.listed)) return false;
  const expectedRemaining = Number(expected.remaining);
  const observedRemaining = Number(observed?.remaining);
  return Number.isFinite(expectedRemaining) && Number.isFinite(observedRemaining) && Math.abs(expectedRemaining - observedRemaining) <= 5;
}

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
          if (!equivalent(check, item.expected[check], observed)) {
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
