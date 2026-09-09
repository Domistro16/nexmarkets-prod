import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyMigrations } from '../infra/schema/migrate.mjs';

const reportPath = new URL('../artifacts/verification/database-migration-report.md', import.meta.url);
const preMigration = '0007_media_upload_verification.sql';

async function writeReport(markdown) {
  await mkdir(new URL('../artifacts/verification/', import.meta.url), { recursive: true });
  await writeFile(reportPath, markdown, 'utf8');
}

function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }

async function tableCounts(client) {
  const tables = [
    ['users', 'account'], ['wallets', 'wallet'], ['projects', 'project'], ['editions', 'edition'],
    ['terms', 'terms_version'], ['passes', 'pass_token_projection'], ['advantages', 'advantage_state_projection'], ['advantage_definitions', 'advantage_definition'],
    ['listings', 'listing_projection'], ['activity', 'builder_milestone'], ['questions', 'builder_question'],
    ['media', 'media_asset'], ['referral_settlements', 'referral_settlement']
  ];
  const counts = {};
  for (const [label, table] of tables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(table)}`);
    counts[label] = result.rows[0].count;
  }
  return counts;
}

async function seedRepresentativeData(client) {
  const userA = 'acct_migration_user_a';
  const userB = 'acct_migration_user_b';
  const walletA = 'wal_migration_a';
  const walletB = 'wal_migration_b';
  const projectA = 'prj_migration_a';
  const projectB = 'prj_migration_b';
  const editionA = 'ed_migration_a';
  const editionB = 'ed_migration_b';
  const addressA = '0x1111111111111111111111111111111111111111';
  const addressB = '0x2222222222222222222222222222222222222222';
  const txA = `0x${'11'.repeat(32)}`;
  const txB = `0x${'22'.repeat(32)}`;
  const block = `0x${'aa'.repeat(32)}`;
  await client.query(`INSERT INTO account(id) VALUES($1),($2)`, [userA, userB]);
  await client.query(
    `INSERT INTO wallet(id,account_id,chain_id,address,verified_at) VALUES
      ($1,$3,46630,'0x1111111111111111111111111111111111111111',now()),
      ($2,$4,46630,'0x2222222222222222222222222222222222222222',now())`, [walletA, walletB, userA, userB]
  );
  await client.query(
    `INSERT INTO project(id,builder_account_id,slug,name,summary,content,status) VALUES
      ($1,$3,'migration-product-a','Migration Product A','A preserved product','{}','PUBLISHED'),
      ($2,$4,'migration-product-b','Migration Product B','B preserved product','{}','DRAFT')`, [projectA, projectB, userA, userB]
  );
  await client.query(
    `INSERT INTO builder_profile(id,account_id,display_name,bio,about,avatar_url,category,links,featured) VALUES
      ('bprf_migration_a',$1,'Migration Builder A','bio','about','', 'tools','{}',true)`, [userA]
  );
  await client.query(
    `INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index)
     VALUES
       ($1,$3,46630,$5,$7,$5,$5,100,$9,10,$10,$11,0),
       ($2,$4,46630,$6,$8,$6,$6,50,$9,11,$10,$12,0)`,
    [editionA, editionB, projectA, projectB, addressA, addressB, `0x${'33'.repeat(32)}`, `0x${'44'.repeat(32)}`, `0x${'55'.repeat(32)}`, block, txA, txB]
  );
  await client.query(
    `INSERT INTO terms_version(id,edition_id,version,terms_hash,active_supply,price_usdg,preview_starts_at,mint_starts_at,mint_ends_at,primary_recipient,royalty_receiver,royalty_bps,advantages_hash,referral_terms_hash,source_block_number,source_block_hash,source_tx_hash,source_log_index)
     VALUES
      ('terms_migration_a',$1,1,'0x${'66'.repeat(32)}',100,10000000,now(),now(),now()+interval '1 day',$3,$3,500,'0x${'77'.repeat(32)}','0x${'88'.repeat(32)}',10,$5,$6,1),
      ('terms_migration_b',$2,1,'0x${'99'.repeat(32)}',50,20000000,now(),now(),now()+interval '1 day',$4,$4,0,'0x${'aa'.repeat(32)}','0x${'bb'.repeat(32)}',11,$5,$7,1)`,
    [editionA, editionB, addressA, addressB, block, txA, txB]
  );
  await client.query(
    `INSERT INTO pass_token_projection(edition_id,token_id,owner_address,terms_hash,minted_block_number,latest_block_number,latest_block_hash,latest_tx_hash,latest_log_index)
     VALUES ($1,1,$3,'0x${'66'.repeat(32)}',12,12,$5,$6,0),($1,2,$4,'0x${'66'.repeat(32)}',12,12,$5,$6,1),($2,1,$3,'0x${'99'.repeat(32)}',13,13,$5,$7,0)`,
    [editionA, editionB, addressA, addressB, block, txA, txB]
  );
  await client.query(
    `INSERT INTO advantage_definition(id,edition_id,terms_hash,advantage_id_hash,kind,starts_at,ends_at,total_units,definition_hash,definition)
     VALUES ('advdef_migration',$1,'0x${'66'.repeat(32)}','0x${'cc'.repeat(32)}','QUANTITY_BASED',now(),now()+interval '30 days',5,'0x${'dd'.repeat(32)}','{}')`, [editionA]
  );
  await client.query(
    `INSERT INTO advantage_state_projection(edition_id,token_id,advantage_id_hash,remaining_units,source_block_number,source_block_hash,source_tx_hash,source_log_index)
     VALUES ($1,1,'0x${'cc'.repeat(32)}',5,12,$2,$3,2)`, [editionA, block, txA]
  );
  await client.query(
     `INSERT INTO listing_projection(order_hash,edition_id,token_id,seller_address,terms_hash,price_usdg,protocol_fee_usdg,royalty_usdg,seller_proceeds_usdg,zone_hash,starts_at,expires_at,status,source_block_number,source_block_hash,source_tx_hash,source_log_index)
     VALUES ('0x${'ee'.repeat(32)}',$1,1,$2,'0x${'66'.repeat(32)}',12000000,120000,600000,11280000,'0x${'ff'.repeat(32)}',now(),now()+interval '7 days','ACTIVE',12,$3,$4,3)`,
    [editionA, addressA, block, txA]
  );
  await client.query(`INSERT INTO builder_milestone(id,builder_account_id,project_id,title,content) VALUES('bms_migration',$1,$2,'Migration shipped','Preserved')`, [userA, projectA]);
  await client.query(`INSERT INTO builder_question(id,builder_account_id,asker_account_id,question) VALUES('bq_migration',$1,$2,'Preserved question')`, [userA, userB]);
  return { ids: { users: [userA, userB], wallets: [walletA, walletB], projects: [projectA, projectB], editions: [editionA, editionB], terms: ['terms_migration_a', 'terms_migration_b'], passes: [`${editionA}:1`, `${editionA}:2`, `${editionB}:1`], advantages: ['advdef_migration'], advantageStates: [`${editionA}:1:0x${'cc'.repeat(32)}`], listings: [`0x${'ee'.repeat(32)}`], activity: ['bms_migration'], questions: ['bq_migration'] } };
}

async function preservedIds(client, snapshot) {
  const checks = {};
  const queries = {
    users: ['account', 'id', snapshot.ids.users],
    wallets: ['wallet', 'id', snapshot.ids.wallets],
    projects: ['project', 'id', snapshot.ids.projects],
    editions: ['edition', 'id', snapshot.ids.editions],
    terms: ['terms_version', 'id', snapshot.ids.terms],
    advantages: ['advantage_definition', 'id', snapshot.ids.advantages],
    listings: ['listing_projection', 'order_hash', snapshot.ids.listings],
    activity: ['builder_milestone', 'id', snapshot.ids.activity],
    questions: ['builder_question', 'id', snapshot.ids.questions]
  };
  for (const [label, [table, key, ids]] of Object.entries(queries)) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(key)}=ANY($1::text[])`, [ids]);
    checks[label] = result.rows[0].count === ids.length;
  }
  const passes = await client.query(`SELECT count(*)::int AS count FROM pass_token_projection WHERE (edition_id || ':' || token_id)=ANY($1::text[])`, [snapshot.ids.passes]);
  checks.passes = passes.rows[0].count === snapshot.ids.passes.length;
  const states = await client.query(`SELECT count(*)::int AS count FROM advantage_state_projection WHERE (edition_id || ':' || token_id || ':' || advantage_id_hash)=ANY($1::text[])`, [snapshot.ids.advantageStates]);
  checks.advantageStates = states.rows[0].count === snapshot.ids.advantageStates.length;
  return checks;
}

async function representativeValues(client) {
  const result = await client.query(`SELECT
    (SELECT name FROM project WHERE id='prj_migration_a') AS project_name,
    (SELECT absolute_supply_cap::text FROM edition WHERE id='ed_migration_a') AS supply_cap,
    (SELECT owner_address FROM pass_token_projection WHERE edition_id='ed_migration_a' AND token_id=1) AS pass_owner,
    (SELECT price_usdg::text FROM listing_projection WHERE order_hash='0x${'ee'.repeat(32)}') AS listing_price,
    (SELECT remaining_units::text FROM advantage_state_projection WHERE edition_id='ed_migration_a' AND token_id=1) AS advantage_remaining,
    (SELECT question FROM builder_question WHERE id='bq_migration') AS question`);
  const observed = result.rows[0];
  const expected = { project_name: 'Migration Product A', supply_cap: '100', pass_owner: '0x1111111111111111111111111111111111111111', listing_price: '12000000', advantage_remaining: '5', question: 'Preserved question' };
  return { expected, observed, preserved: Object.keys(expected).every((key) => String(observed[key]) === String(expected[key])) };
}

async function verifyDatabaseMigration() {
  const connectionString = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    const markdown = '# Database migration verification\n\n- Status: **BLOCKED**\n- Blocker: neither `DIRECT_URL` nor `DATABASE_URL` is configured in this environment.\n- Result: no migration or database mutation was attempted; no counts or IDs were fabricated.\n- Required environment: PostgreSQL 17 (the CI service provides this).\n';
    await writeReport(markdown);
    console.log(JSON.stringify({ status: 'BLOCKED', reason: 'POSTGRES_URL_REQUIRED', report: reportPath.pathname }));
    process.exitCode = 2;
    return;
  }

  const admin = new pg.Pool({ connectionString, max: 2, application_name: 'nexmarkets-migration-verify-admin' });
  const schemaName = `nexmarkets_migration_verify_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  let migrationPool = null;
  let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    created = true;
    const scopedUrl = new URL(connectionString);
    scopedUrl.searchParams.set('options', `-c search_path=${schemaName},public`);
    migrationPool = new pg.Pool({ connectionString: scopedUrl.toString(), max: 2, application_name: 'nexmarkets-migration-verify' });
    await applyMigrations({ pool: migrationPool, upTo: preMigration });
    const client = await migrationPool.connect();
    let snapshot;
    let before;
    let after;
    let ids;
    try {
      await client.query('BEGIN');
      snapshot = await seedRepresentativeData(client);
      await client.query('COMMIT');
      before = await tableCounts(client);
      const expectedMigrations = await applyMigrations({ pool: migrationPool });
      after = await tableCounts(client);
      ids = await preservedIds(client, snapshot);
      const values = await representativeValues(client);
      const targetMigrationRows = (await admin.query('SELECT version,sha256 FROM public.schema_migration ORDER BY version')).rows;
      const targetMigrations = targetMigrationRows.map((row) => row.version);
      const targetRegistryMatches = targetMigrations.length === expectedMigrations.length
        && expectedMigrations.every((version, index) => targetMigrations[index] === version)
        && targetMigrationRows.every((row) => /^[0-9a-f]{64}$/u.test(row.sha256));
      const fk = await client.query(`SELECT
        (SELECT count(*) FROM project p LEFT JOIN builder b ON b.id=p.builder_id WHERE p.builder_id IS NOT NULL AND b.id IS NULL)::int AS project_builder_orphans,
        (SELECT count(*) FROM builder_profile bp LEFT JOIN builder b ON b.id=bp.builder_id WHERE b.id IS NULL)::int AS profile_builder_orphans,
        (SELECT count(*) FROM advantage_state_projection a LEFT JOIN edition e ON e.id=a.edition_id WHERE e.id IS NULL)::int AS advantage_orphans,
        (SELECT count(*) FROM listing_projection l LEFT JOIN edition e ON e.id=l.edition_id WHERE e.id IS NULL)::int AS listing_orphans,
        (SELECT count(*) FROM builder b LEFT JOIN builder_membership bm ON bm.builder_id=b.id AND bm.account_id=b.owner_account_id WHERE bm.builder_id IS NULL)::int AS missing_owner_memberships,
        (SELECT count(*) FROM builder_profile bp JOIN builder_profile bp2 ON bp2.builder_id=bp.builder_id AND bp2.id<>bp.id)::int AS duplicate_profile_builder_assignments,
        (SELECT count(*) - count(DISTINCT (edition_id::text || ':' || token_id::text)) FROM pass_token_projection)::int AS duplicate_pass_assignments`);
      const checks = fk.rows[0];
      const pass = targetRegistryMatches && Object.values(ids).every(Boolean) && values.preserved && Object.values(checks).every((value) => Number(value) === 0);
      const lines = ['# Database migration verification', '', `- Status: **${pass ? 'PASS' : 'FAIL'}**`, '- Method: clean ephemeral PostgreSQL schema; migrations 0001–0007 applied, representative pre-migration data inserted, then the actual migration runner applied 0008–0009.', '', '| Entity | Before | After |', '|---|---:|---:|'];
      for (const label of Object.keys(before)) lines.push(`| ${label} | ${before[label]} | ${after[label]} |`);
      const builderCounts = await client.query(`SELECT
        (SELECT count(*)::int FROM builder) AS builders,
        (SELECT count(*)::int FROM builder_membership) AS builder_memberships,
        (SELECT count(*)::int FROM primary_sale_accounting) AS primary_sale_accounting`);
      lines.push(`| builders (new authority) | n/a | ${builderCounts.rows[0].builders} |`);
      lines.push(`| builder memberships (new authority) | n/a | ${builderCounts.rows[0].builder_memberships} |`);
      lines.push(`| primary sale accounting (new authority) | n/a | ${builderCounts.rows[0].primary_sale_accounting} |`);
      lines.push('', '## Representative ID preservation', '', ...Object.entries(ids).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'FAIL'}`));
      lines.push('', '## Integrity checks', '', ...Object.entries(checks).map(([key, value]) => `- ${key}: ${Number(value) === 0 ? 'PASS' : `FAIL (${value})`}`));
      lines.push('', '## Representative values', '', `- Result: ${values.preserved ? 'PASS' : 'FAIL'}`, `- Expected: \`${JSON.stringify(values.expected)}\``, `- Observed: \`${JSON.stringify(values.observed)}\``);
      lines.push('', '## Migration identity results', '', '- Existing project, Edition, Pass, listing, Advantage, activity and question IDs were checked after migration.', '- One deterministic Builder identity and owner membership were created for the historical Builder profile; the profile ID and all legacy account links remain preserved.', '- The ephemeral verification schema was discarded after verification.');
      lines.push('', '## Applied target migration registry', '', `- Result: ${targetRegistryMatches ? 'PASS' : 'FAIL'}`, `- Applied migrations: ${targetMigrations.length}`, `- Versions: ${targetMigrations.join(', ')}`);
      await writeReport(`${lines.join('\n')}\n`);
      if (!pass) process.exitCode = 1;
      console.log(JSON.stringify({ status: pass ? 'PASS' : 'FAIL', before, after, ids, integrity: checks, values, targetRegistry: { pass: targetRegistryMatches, migrations: targetMigrations }, report: reportPath.pathname }));
    } finally {
      client.release();
    }
  } finally {
    if (migrationPool) await migrationPool.end();
    if (created) await admin.query(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
    await admin.end();
  }
}

verifyDatabaseMigration().catch(async (error) => {
  await writeReport(`# Database migration verification\n\n- Status: **BLOCKED**\n- Blocker: ${String(error.message).replaceAll('\n', ' ')}\n- Result: migration certification did not complete; no counts or hashes were fabricated.\n`);
  console.error(JSON.stringify({ status: 'BLOCKED', error: error.message, report: reportPath.pathname }));
  process.exitCode = 2;
});
