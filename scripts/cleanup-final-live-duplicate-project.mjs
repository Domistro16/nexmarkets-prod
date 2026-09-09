import pg from 'pg';
import { readFile } from 'node:fs/promises';

const artifact = JSON.parse(await readFile(new URL('../artifacts/verification/final-live-browser/builder-preview.json', import.meta.url), 'utf8'));
const keepId = artifact.project?.id;
const projectName = artifact.projectName;
if (!/^prj_[0-9a-f-]+$/i.test(keepId || '') || !projectName?.startsWith('NexMarkets Final Live ')) {
  throw new Error('FINAL_LIVE_ARTIFACT_IDENTITY_REQUIRED');
}

const client = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const rows = await client.query(
    `SELECT p.id,p.builder_id,p.status,p.content->'review' AS review,
            (SELECT count(*)::int FROM edition e WHERE e.project_id=p.id) AS editions,
            (SELECT count(*)::int FROM builder_milestone m WHERE m.project_id=p.id) AS milestones,
            (SELECT count(*)::int FROM project_watchlist w WHERE w.project_id=p.id) AS watches
       FROM project p WHERE p.name=$1 FOR UPDATE`,
    [projectName]
  );
  const remove = rows.rows.filter((row) => row.id !== keepId);
  const keep = rows.rows.find((row) => row.id === keepId);
  if (!keep || remove.length !== 1 || rows.rows.length !== 2) throw new Error('EXPECTED_EXACTLY_ONE_RETRY_DUPLICATE');
  if (remove.some((row) => row.editions || row.milestones || row.watches)) throw new Error('DUPLICATE_HAS_DEPENDENT_STATE');
  if (keep.review?.advantages !== true || keep.review?.evidence !== true || keep.review?.preview !== true) throw new Error('CANONICAL_RETRY_REVIEW_EVIDENCE_MISSING');
  await client.query('DELETE FROM project WHERE id=$1', [remove[0].id]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ status: 'PASS', projectName, keptProjectId: keepId, removedRetryProjectId: remove[0].id, dependentRowsRemoved: 0 }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
