const VALID = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

export class MetricsRegistry {
  constructor() { this.values = new Map(); }
  increment(name, amount = 1) { if (!VALID.test(name)) throw new Error('invalid metric'); this.values.set(name, (this.values.get(name) ?? 0) + amount); }
  set(name, value) { if (!VALID.test(name) || !Number.isFinite(value)) throw new Error('invalid metric'); this.values.set(name, value); }
  get(name) { return this.values.get(name) ?? 0; }
  render() { return `${[...this.values.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([name,value]) => `${name} ${value}`).join('\n')}\n`; }
}

export const REQUIRED_METRICS = Object.freeze([
  'nexmarkets_api_requests_total','nexmarkets_api_failures_total','nexmarkets_transactions_failed_total',
  'nexmarkets_indexer_latest_block','nexmarkets_indexer_lag_blocks','nexmarkets_reconciliation_errors_total',
  'nexmarkets_reconciliation_lag_seconds','nexmarkets_outbox_retries_total','nexmarkets_db_ready'
]);
