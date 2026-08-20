import pg from 'pg';
import { createHash } from 'node:crypto';
import { Interface } from 'ethers';
import { JsonRpcClient } from '../../../packages/chain/src/rpc.mjs';

const TERMINAL = new Set(['FINALIZED', 'CANCELLED', 'REVERTED', 'REORGED']);
const SAFE_ABI = new Interface(['event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)','event ExecutionFailure(bytes32 indexed txHash,uint256 payment)']);
const FACTORY_ABI = new Interface(['event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)']);
const sha = (value) => createHash('sha256').update(value).digest('hex').slice(0, 24);
const lower = (value) => typeof value === 'string' ? value.toLowerCase() : value;
const hexNumber = (value) => value == null ? null : Number(BigInt(value));

/**
 * Advances user-submitted transactions from the API lifecycle to chain-backed
 * states. The worker never treats a tx hash as success: every transition is
 * backed by an RPC receipt and block evidence and is idempotent by event_id.
 */
export class ChainLifecycleWorker {
  constructor({ pool, connectionString = process.env.DATABASE_URL, rpc, rpcUrl = process.env.RH_MAINNET_RPC_URL, chainId = 4663, finalityDepth = 12, maxAttempts = 12, protocolAdminSafe = process.env.PROTOCOL_ADMIN_SAFE_ADDRESS, factoryAddress = process.env.NEX_PASS_FACTORY_ADDRESS, mintController = process.env.NEX_MINT_CONTROLLER_ADDRESS, logger = console } = {}) {
    this.pool = pool ?? new pg.Pool({ connectionString, max: 4, application_name: 'nexmarkets-chain-worker' });
    this.ownsPool = !pool;
    this.rpc = rpc ?? new JsonRpcClient(rpcUrl);
    this.chainId = Number(chainId);
    this.finalityDepth = Number(finalityDepth);
    this.maxAttempts = Number(maxAttempts);
    this.protocolAdminSafe = lower(protocolAdminSafe);
    this.factoryAddress = lower(factoryAddress);
    this.mintController = lower(mintController);
    this.logger = logger;
  }

  async close() { if (this.ownsPool) await this.pool.end(); }

  async runOnce(limit = 50) {
    const head = await this.rpc.getBlockNumber();
    const txRows = await this.pool.query(
      `SELECT t.*,j.id job_id,j.attempt,j.next_attempt_at
       FROM chain_transaction t LEFT JOIN transaction_job j ON j.transaction_id=t.id AND j.job_type='CHAIN_LIFECYCLE'
       WHERE t.chain_id=$1 AND t.state IN ('SUBMITTED','CONFIRMED') AND t.tx_hash IS NOT NULL
         AND (j.id IS NULL OR j.completed_at IS NULL) AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=now())
       ORDER BY t.updated_at LIMIT $2`, [this.chainId, limit]
    );
    let progressed = 0; let pending = 0; let failed = 0;
    for (const row of txRows.rows) {
      try {
        const result = await this.processTransaction(row, head);
        if (result.pending) pending += 1; else progressed += result.transitions;
      } catch (error) {
        failed += 1;
        await this.recordRetry(row, error);
        this.logger.error?.({ event: 'chain_lifecycle_failed', transactionId: row.id, error: error.message });
      }
    }
    const safe = await this.processEditionRequests(head, limit);
    return { chainId: this.chainId, head, inspected: txRows.rows.length, progressed, pending, failed, safeRequests: safe };
  }

  async processTransaction(row, head) {
    const receipt = await this.rpc.getTransactionReceipt(row.tx_hash);
    if (!receipt) {
      if (row.state === 'CONFIRMED' && row.block_number != null && row.block_hash) {
        const canonical = await this.rpc.getBlockByNumber(Number(row.block_number));
        if (canonical?.hash && lower(canonical.hash) !== lower(row.block_hash)) return { pending: false, transitions: await this.transition(row, 'REORGED', { failureCode: 'CONFIRMED_BLOCK_REORGED', txHash: row.tx_hash, blockNumber: row.block_number, blockHash: row.block_hash }) };
      }
      await this.recordRetry(row, new Error('RECEIPT_PENDING')); return { pending: true, transitions: 0 };
    }
    const tx = this.rpc.getTransactionByHash ? await this.rpc.getTransactionByHash(row.tx_hash) : null;
    const receiptBlock = hexNumber(receipt.blockNumber);
    const receiptHash = lower(receipt.blockHash);
    if (tx?.from && lower(tx.from) !== lower(row.wallet_address)) return { pending: false, transitions: await this.transition(row, 'REVERTED', { failureCode: 'TX_FROM_MISMATCH', txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash }) };
    if (row.to_address && (tx?.to ?? receipt.to) && lower(row.to_address) !== lower(tx?.to ?? receipt.to)) return { pending: false, transitions: await this.transition(row, 'REVERTED', { failureCode: 'TX_TO_MISMATCH', txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash }) };
    if (row.calldata && (!tx?.input || lower(tx.input) !== lower(row.calldata))) return { pending: false, transitions: await this.transition(row, 'REVERTED', { failureCode: 'TX_CALLDATA_MISMATCH', txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash }) };
    const canonicalBlock = receiptBlock == null ? null : await this.rpc.getBlockByNumber(receiptBlock);
    if (canonicalBlock?.hash && receiptHash && lower(canonicalBlock.hash) !== receiptHash) {
      return { pending: false, transitions: await this.transition(row, 'REORGED', { failureCode: 'RECEIPT_BLOCK_REORGED', txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash }) };
    }
    const status = receipt.status === '0x0' || receipt.status === 0 || receipt.status === false ? 'REVERTED' : null;
    if (status) return { pending: false, transitions: await this.transition(row, status, { failureCode: 'ONCHAIN_REVERT', txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash }) };
    const confirmations = receiptBlock == null ? 0 : Math.max(0, head - receiptBlock + 1);
    let transitions = 0;
    if (row.state === 'SUBMITTED') {
      await this.transition(row, 'CONFIRMED', { txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash, confirmations });
      transitions += 1;
      row = { ...row, state: 'CONFIRMED' };
    }
    if (confirmations >= this.finalityDepth && row.state === 'CONFIRMED') {
      await this.transition(row, 'FINALIZED', { txHash: row.tx_hash, blockNumber: receiptBlock, blockHash: receiptHash, confirmations, finalizedAt: new Date().toISOString() });
      transitions += 1;
    } else {
      await this.updateConfirmations(row.id, confirmations, receiptBlock, receiptHash);
    }
    if (TERMINAL.has(row.state) || confirmations >= this.finalityDepth) await this.completeJob(row);
    return { pending: false, transitions };
  }

  async transition(row, toState, evidence) {
    if (row.state === toState) { await this.completeJob(row); return 0; }
    const eventId = `chain:${row.id}:${row.state}:${toState}:${evidence.txHash ?? row.tx_hash ?? ''}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE chain_transaction SET state=$2,tx_hash=COALESCE($3,tx_hash),block_number=COALESCE($4,block_number),block_hash=COALESCE($5,block_hash),confirmations=COALESCE($6,confirmations),failure_code=COALESCE($7,failure_code),finalized_at=CASE WHEN $2='FINALIZED' THEN COALESCE($8::timestamptz,now()) ELSE finalized_at END,updated_at=now() WHERE id=$1 AND state=$9 RETURNING *`,
        [row.id, toState, evidence.txHash ?? null, evidence.blockNumber ?? null, evidence.blockHash ?? null, evidence.confirmations ?? null, evidence.failureCode ?? null, evidence.finalizedAt ?? null, row.state]
      );
      if (!updated.rowCount) { await client.query('ROLLBACK'); return 0; }
      await client.query(
        `INSERT INTO transaction_event(event_id,transaction_id,from_state,to_state,evidence) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(event_id) DO NOTHING`,
        [eventId, row.id, row.state, toState, JSON.stringify(evidence)]
      );
      await client.query('UPDATE transaction_job SET completed_at=CASE WHEN $2 IN (\'FINALIZED\',\'REVERTED\',\'REORGED\') THEN now() ELSE completed_at END,locked_at=NULL WHERE transaction_id=$1 AND job_type=\'CHAIN_LIFECYCLE\'', [row.id, toState]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await this.enqueueLifecycleNotification(row, toState, evidence);
    return 1;
  }

  async updateConfirmations(id, confirmations, blockNumber, blockHash) {
    await this.pool.query('UPDATE chain_transaction SET confirmations=$2,block_number=COALESCE($3,block_number),block_hash=COALESCE($4,block_hash),updated_at=now() WHERE id=$1 AND state=\'CONFIRMED\'', [id, confirmations, blockNumber, blockHash]);
  }

  async recordRetry(row, error) {
    const attempt = Number(row.attempt ?? 0) + 1;
    await this.pool.query(
      `INSERT INTO transaction_job(id,transaction_id,job_type,attempt,next_attempt_at,last_error)
       VALUES($1,$2,'CHAIN_LIFECYCLE',$3,now()+($4::text||' seconds')::interval,$5)
       ON CONFLICT(transaction_id,job_type) DO UPDATE SET attempt=$3,next_attempt_at=now()+($4::text||' seconds')::interval,last_error=$5,completed_at=NULL`,
      [`job_${sha(row.id)}`, row.id, attempt, Math.min(900, 2 ** Math.min(attempt, 9)), String(error.message).slice(0, 1000)]
    );
  }

  async completeJob(row) { await this.pool.query('UPDATE transaction_job SET completed_at=COALESCE(completed_at,now()),locked_at=NULL WHERE transaction_id=$1 AND job_type=\'CHAIN_LIFECYCLE\'', [row.id]); }

  async enqueueLifecycleNotification(row, state, evidence) {
    const type = state === 'FINALIZED' ? 'TRANSACTION_FINALIZED' : state === 'REVERTED' ? 'TRANSACTION_REVERTED' : state === 'REORGED' ? 'TRANSACTION_REORGED' : state === 'CONFIRMED' ? 'TRANSACTION_CONFIRMED' : null;
    if (!type) return;
    const notificationId = `not_${sha(`${type}:${row.id}`)}`;
    const outboxId = `out_${sha(`${type}:${row.id}`)}`;
    await this.pool.query(`INSERT INTO notification(id,account_id,type,business_key,payload) SELECT $1,w.account_id,$2,$3,$4::jsonb FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id WHERE t.id=$5 ON CONFLICT(type,business_key,account_id) DO NOTHING`, [notificationId, type, row.id, JSON.stringify({ transactionId: row.id, state, evidence }), row.id]);
    await this.pool.query(`INSERT INTO outbox_event(id,aggregate_type,aggregate_id,event_type,business_key,payload) VALUES($1,'CHAIN_TRANSACTION',$2,$3,$4,$5::jsonb) ON CONFLICT(event_type,business_key) DO NOTHING`, [outboxId, row.id, type, row.id, JSON.stringify({ transactionId: row.id, state, evidence })]);
  }

  verifyEditionSafeEvidence(request, receipt, tx) {
    if (!this.protocolAdminSafe || !this.factoryAddress || !tx?.to || lower(tx.to) !== this.protocolAdminSafe) return { ok: false, reason: 'SAFE_TARGET_MISMATCH' };
    if (receipt.status === '0x0' || receipt.status === 0 || receipt.status === false) return { ok: false, reason: 'SAFE_REVERTED' };
    const expectedId = lower(request.edition_id_hash ?? request.request_payload?.editionId ?? '');
    let execution = false; let executionHash = null; let edition = null;
    for (const log of receipt.logs ?? []) {
      if (lower(log.address) === this.protocolAdminSafe) {
        try { const parsed = SAFE_ABI.parseLog({ topics: log.topics, data: log.data }); if (parsed?.name === 'ExecutionFailure') return { ok: false, reason: 'SAFE_EXECUTION_FAILURE' }; if (parsed?.name === 'ExecutionSuccess') { execution = true; executionHash = lower(parsed.args.txHash); } } catch { /* unrelated Safe log */ }
      }
      if (lower(log.address) === this.factoryAddress) {
        try { const parsed = FACTORY_ABI.parseLog({ topics: log.topics, data: log.data }); if (parsed?.name === 'EditionCreated') edition = parsed.args; } catch { /* unrelated Factory log */ }
      }
    }
    if (!execution || (request.safe_transaction_hash && executionHash !== lower(request.safe_transaction_hash))) return { ok: false, reason: 'SAFE_EXECUTION_EVIDENCE_MISSING' };
    if (!edition || lower(edition.editionId) !== expectedId) return { ok: false, reason: 'EDITION_CREATED_EVIDENCE_MISSING' };
    const payload = request.request_payload ?? {};
    const predictedEdition = lower(request.predicted_edition_address ?? payload.predictedEditionAddress ?? payload.predicted_edition_address);
    if (!predictedEdition || lower(edition.edition) !== predictedEdition) return { ok: false, reason: 'SAFE_EDITION_ADDRESS_MISMATCH' };
    if (!this.protocolAdminSafe || lower(edition.protocolAdmin) !== this.protocolAdminSafe) return { ok: false, reason: 'SAFE_PROTOCOL_ADMIN_MISMATCH' };
    const expectedMintController = lower(payload.mintController ?? payload.mint_controller ?? this.mintController);
    if (!expectedMintController || lower(edition.mintController) !== expectedMintController) return { ok: false, reason: 'SAFE_MINT_CONTROLLER_MISMATCH' };
    if (payload.publisher && lower(edition.publisher) !== lower(payload.publisher)) return { ok: false, reason: 'SAFE_CALLDATA_PUBLISHER_MISMATCH' };
    if (payload.absoluteSupplyCap != null && String(edition.absoluteSupplyCap) !== String(payload.absoluteSupplyCap)) return { ok: false, reason: 'SAFE_CALLDATA_SUPPLY_MISMATCH' };
    if (payload.artworkCommitment && lower(edition.artworkCommitment) !== lower(payload.artworkCommitment)) return { ok: false, reason: 'SAFE_CALLDATA_ARTWORK_MISMATCH' };
    if (payload.salt && lower(edition.salt) !== lower(payload.salt)) return { ok: false, reason: 'SAFE_CALLDATA_SALT_MISMATCH' };
    return { ok: true, edition: lower(edition.edition), editionId: lower(edition.editionId) };
  }

  async processEditionRequests(head, limit) {
    const { rows } = await this.pool.query(`SELECT * FROM edition_request WHERE chain_id=$1 AND safe_status IN ('SUBMITTED','CONFIRMED') AND tx_hash IS NOT NULL ORDER BY updated_at LIMIT $2`, [this.chainId, limit]);
    let changed = 0;
    for (const request of rows) {
      const receipt = await this.rpc.getTransactionReceipt(request.tx_hash);
      if (!receipt) continue;
      const tx = this.rpc.getTransactionByHash ? await this.rpc.getTransactionByHash(request.tx_hash) : null;
      const evidence = this.verifyEditionSafeEvidence(request, receipt, tx);
      const blockNumber = hexNumber(receipt.blockNumber); const block = blockNumber == null ? null : await this.rpc.getBlockByNumber(blockNumber);
      const good = evidence.ok && (!block?.hash || lower(block.hash) === lower(receipt.blockHash));
      const final = good && blockNumber != null && head - blockNumber + 1 >= this.finalityDepth;
      const status = !good ? 'REJECTED' : final ? 'FINALIZED' : 'CONFIRMED';
      await this.pool.query('UPDATE edition_request SET safe_status=$2,updated_at=now() WHERE id=$1 AND safe_status IN (\'SUBMITTED\',\'CONFIRMED\')', [request.id, status]);
      changed += 1;
    }
    return changed;
  }
}

export async function runChainLifecycleOnce(options = {}) { const worker = new ChainLifecycleWorker(options); try { return await worker.runOnce(options.limit); } finally { await worker.close(); } }
