import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricsRegistry, REQUIRED_METRICS } from '../packages/observability/src/metrics.mjs';

test('observability registry exposes required non-sensitive operational metrics', () => {
  const metrics = new MetricsRegistry();
  for (const name of REQUIRED_METRICS) metrics.set(name, 0);
  metrics.increment('nexmarkets_api_requests_total');
  assert.equal(metrics.get('nexmarkets_api_requests_total'), 1);
  for (const name of REQUIRED_METRICS) assert.match(metrics.render(), new RegExp(`^${name} `, 'm'));
  assert.throws(() => metrics.set('bad metric', 1));
});
