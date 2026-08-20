export class OutboxWorker {
  constructor({ repository, deliver, maxAttempts = 8, logger = { info() {}, error() {} }, metrics = { increment() {} } }) {
    this.repository = repository;
    this.deliver = deliver;
    this.maxAttempts = maxAttempts;
    this.logger = logger;
    this.metrics = metrics;
  }

  async runBatch(limit = 50) {
    const events = await this.repository.claimOutbox(limit);
    const result = { claimed: events.length, delivered: 0, retried: 0, dead: 0 };
    for (const event of events) {
      if (event.deliveredAt) continue;
      try {
        await this.deliver(event, { idempotencyKey: `${event.eventType}:${event.businessKey}` });
        await this.repository.markOutboxDelivered(event.id);
        result.delivered += 1;
      } catch (error) {
        const attempt = event.attempt + 1;
        const dead = attempt >= this.maxAttempts;
        const delaySeconds = Math.min(3600, 2 ** attempt);
        await this.repository.markOutboxFailed(event.id, { attempt, dead, delaySeconds, error: error.message });
        this.metrics.increment('nexmarkets_outbox_retries_total');
        result[dead ? 'dead' : 'retried'] += 1;
        this.logger.error({ event: 'outbox_delivery_failed', outboxId: event.id, attempt, dead, error: error.message });
      }
    }
    return result;
  }
}
