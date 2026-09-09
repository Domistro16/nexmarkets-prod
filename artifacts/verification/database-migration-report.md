# Database migration verification

- Status: **PASS**
- Method: clean ephemeral PostgreSQL schema; migrations 0001–0007 applied, representative pre-migration data inserted, then the actual migration runner applied 0008–0009.

| Entity | Before | After |
|---|---:|---:|
| users | 2 | 2 |
| wallets | 2 | 2 |
| projects | 2 | 2 |
| editions | 2 | 2 |
| terms | 2 | 2 |
| passes | 3 | 3 |
| advantages | 1 | 1 |
| advantage_definitions | 1 | 1 |
| listings | 1 | 1 |
| activity | 1 | 1 |
| questions | 1 | 1 |
| media | 0 | 0 |
| referral_settlements | 0 | 0 |
| builders (new authority) | n/a | 2 |
| builder memberships (new authority) | n/a | 2 |
| primary sale accounting (new authority) | n/a | 0 |

## Representative ID preservation

- users: PASS
- wallets: PASS
- projects: PASS
- editions: PASS
- terms: PASS
- advantages: PASS
- listings: PASS
- activity: PASS
- questions: PASS
- passes: PASS
- advantageStates: PASS

## Integrity checks

- project_builder_orphans: PASS
- profile_builder_orphans: PASS
- advantage_orphans: PASS
- listing_orphans: PASS
- missing_owner_memberships: PASS
- duplicate_profile_builder_assignments: PASS
- duplicate_pass_assignments: PASS

## Representative values

- Result: PASS
- Expected: `{"project_name":"Migration Product A","supply_cap":"100","pass_owner":"0x1111111111111111111111111111111111111111","listing_price":"12000000","advantage_remaining":"5","question":"Preserved question"}`
- Observed: `{"project_name":"Migration Product A","supply_cap":"100","pass_owner":"0x1111111111111111111111111111111111111111","listing_price":"12000000","advantage_remaining":"5","question":"Preserved question"}`

## Migration identity results

- Existing project, Edition, Pass, listing, Advantage, activity and question IDs were checked after migration.
- One deterministic Builder identity and owner membership were created for the historical Builder profile; the profile ID and all legacy account links remain preserved.
- The ephemeral verification schema was discarded after verification.

## Applied target migration registry

- Result: PASS
- Applied migrations: 9
- Versions: 0001_phase0_authority.sql, 0002_nexmarkets_v1.sql, 0003_social_and_builder_profiles.sql, 0004_multi_network_chain_ids.sql, 0005_permissionless_editions.sql, 0006_builder_questions.sql, 0007_media_upload_verification.sql, 0008_builder_identities_and_primary_accounting.sql, 0009_multi_builder_secondary_relationships.sql
