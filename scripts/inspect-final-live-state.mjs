import pg from 'pg';

const projectName = process.env.FINAL_LIVE_PROJECT_NAME?.trim() || 'NexMarkets Final Live 2026-09-09-a';
const client = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await client.connect();
try {
  const projects = await client.query(
    `SELECT p.id,p.slug,p.name,p.status,p.builder_id,p.builder_account_id,p.content->'review' AS review,
            p.content->'chainDeployment' AS chain_deployment,p.created_at,p.updated_at,
            (SELECT count(*)::int FROM edition e WHERE e.project_id=p.id) AS edition_count,
            (SELECT count(*)::int FROM builder_milestone m WHERE m.project_id=p.id) AS milestone_count,
            (SELECT count(*)::int FROM project_watchlist w WHERE w.project_id=p.id) AS watch_count
       FROM project p WHERE p.name=$1 ORDER BY p.created_at`,
    [projectName]
  );
  const builderIds = [...new Set(projects.rows.map((row) => row.builder_id).filter(Boolean))];
  const builders = builderIds.length ? await client.query(
    `SELECT b.id,b.owner_account_id,bm.role,bp.display_name,bp.links
       FROM builder b JOIN builder_membership bm ON bm.builder_id=b.id
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
      WHERE b.id=ANY($1::text[]) ORDER BY b.id`,
    [builderIds]
  ) : { rows: [] };
  console.log(JSON.stringify({ projectName, projects: projects.rows, builders: builders.rows }, null, 2));
} finally {
  await client.end();
}
