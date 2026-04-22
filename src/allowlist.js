/**
 * ZAPPHIRE Hermes MCP — Firestore Collection Allowlist Enforcement
 * Fork: jazzahupwork-boop/mcp-firestore-server v2.0.1-zapphire1
 * Spec: spec-hermes-mcp-connector-architecture-v1 V1.2
 *
 * SECURITY NOTE — Invariant 4 / SPEC-AMEND-04 (path distinction):
 * The spec invariant shorthand refers to the FOREMAN credential directory
 * (the path WITHOUT the '-hermes' suffix). The Hermes credential directory
 * is the path WITH '-hermes' suffix and is injected by the systemd
 * EnvironmentFile at deploy time (SS-3 scope).
 * This module does NOT reference any credential path — all secrets are
 * accessed via environment variables set externally by systemd.
 *
 * HARD-CODED WRITE EXCLUSIONS — Invariant 5:
 * 'knowledge' and 'okg' collections CANNOT appear in the write path
 * regardless of COLLECTION_WRITE_ALLOWLIST value. This is enforced at
 * code level and cannot be overridden by any environment variable.
 */

/** Collections permanently excluded from all write operations — Invariant 5 */
const HARD_EXCLUDED_FROM_WRITES = ['knowledge', 'okg'];

/**
 * Tools that perform write operations.
 * NOTE: 'delete_document' is intentionally absent.
 * Deletion is Night Manager scope only (D2 Director decision, SS-B 2026-04-23).
 * Hermes flags documents for deletion via a status field in hermes-staging;
 * the Night Manager executes the actual deletion.
 */
const WRITE_TOOLS = new Set([
  'create_document',
  'update_document',
]);

/**
 * Read tools that carry a 'collection' argument and require allowlist checking.
 * 'list_collections' is excluded here — it has no collection arg and is
 * handled separately (permitted at tool level; output scope is determined
 * by COLLECTION_READ_ALLOWLIST at the caller layer for future multi-tenant use).
 */
const READ_TOOLS_WITH_COLLECTION = new Set([
  'query_collection',
  'get_document',
  'query_with_where',
  'count_documents',
  'batch_get',
]);

/**
 * Parse a comma-separated allowlist environment variable.
 *
 * - Trims each entry (handles \r, spaces, tabs — e.g. Windows line-ending
 *   residue in EnvironmentFile values)
 * - Normalises to lowercase for case-insensitive comparison
 * - Filters out empty entries
 *
 * Returns an empty array if the env var is unset, empty, or blank.
 */
export function parseAllowlist(envVar) {
  if (!envVar || typeof envVar !== 'string') return [];
  return envVar
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

/**
 * Extract the top-level Firestore collection segment from a path.
 *
 * 'hermes-staging/doc123/sub' → 'hermes-staging'
 * 'Knowledge' → 'knowledge'
 * ' knowledge ' → 'knowledge'
 *
 * Only the first path segment is returned — allowlist checks operate on
 * the top-level collection only, not on subcollection paths.
 */
export function extractCollectionSegment(collection) {
  if (!collection || typeof collection !== 'string') return '';
  return collection.split('/')[0].trim().toLowerCase();
}

/**
 * Validate allowlist environment variable format at server startup.
 *
 * Throws on entries containing illegal characters (potential injection vectors).
 * Logs a warning but does NOT throw on whitespace-only entries — these are
 * treated as empty (fail-closed for writes, consistent with unset behaviour).
 *
 * Valid Firestore top-level collection name characters: [a-zA-Z0-9_-]
 * Slashes, dots, spaces within entries, and other special characters are
 * rejected.
 *
 * Called in startServer() before Firebase initialisation. Process exits
 * on throw (caught by startServer catch block). Satisfies UT10.
 */
export function validateAllowlistConfig() {
  const VALID_ENTRY = /^[a-zA-Z0-9_-]+$/;

  for (const [varName, envVal] of [
    ['COLLECTION_WRITE_ALLOWLIST', process.env.COLLECTION_WRITE_ALLOWLIST],
    ['COLLECTION_READ_ALLOWLIST', process.env.COLLECTION_READ_ALLOWLIST],
  ]) {
    if (!envVal) continue;

    const rawEntries = envVal.split(',');
    const validEntries = [];

    for (const raw of rawEntries) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue; // whitespace-only — skip silently

      if (!VALID_ENTRY.test(trimmed)) {
        throw new Error(
          `[ALLOWLIST] Invalid entry in ${varName}: "${trimmed}". ` +
          `Only letters, numbers, underscores, and hyphens are permitted. ` +
          `Slashes, dots, and other special characters are not valid ` +
          `Firestore top-level collection name characters.`
        );
      }
      validEntries.push(trimmed.toLowerCase());
    }

    if (envVal.trim().length > 0 && validEntries.length === 0) {
      // All entries were whitespace-only — warn and continue (fail-closed)
      console.error(
        `[ALLOWLIST] Warning: ${varName} is set but contains no valid entries ` +
        `after parsing. Defaulting to restrictive behaviour ` +
        `(writes blocked / reads unrestricted per policy).`
      );
    }
  }
}

/**
 * Enforce collection allowlist policy for a tool call.
 *
 * Returns { permitted: true } or { permitted: false, reason: string }.
 *
 * SECURITY — ENV-R-02 defence:
 * The 'reason' string is a FIXED constant — it NEVER includes the requested
 * collection name, the allowlist contents, or any environment variable value.
 * This prevents information disclosure via error messages.
 *
 * Policy summary:
 *
 *   WRITE tools (create_document, update_document):
 *     1. Hard-excluded collections (knowledge, okg) → BLOCKED always
 *     2. COLLECTION_WRITE_ALLOWLIST unset or empty → BLOCKED (fail-closed)
 *     3. Collection not in write allowlist (exact match) → BLOCKED
 *     4. Collection in write allowlist → PERMITTED
 *
 *   READ tools with collection arg:
 *     1. COLLECTION_READ_ALLOWLIST unset or empty → PERMITTED (fail-open)
 *     2. Collection in read allowlist (exact match) → PERMITTED
 *     3. Collection not in read allowlist → BLOCKED
 *
 *   list_collections: no collection arg → PERMITTED at this layer
 *
 *   Unknown tools: PERMITTED (unknown tools fail at handler dispatch)
 */
export function enforceAllowlist(toolName, args) {
  const BLOCKED = { permitted: false, reason: 'Collection not permitted' };
  const ALLOWED = { permitted: true };

  if (WRITE_TOOLS.has(toolName)) {
    const rawCollection = args?.collection ?? args?.collectionId ?? '';
    const segment = extractCollectionSegment(rawCollection);

    // Step 1: Hard exclusion — Invariant 5 (cannot be bypassed by any env var)
    if (HARD_EXCLUDED_FROM_WRITES.includes(segment)) return BLOCKED;

    // Step 2: Write allowlist — fail-closed when unset or empty
    const writeAllowlist = parseAllowlist(process.env.COLLECTION_WRITE_ALLOWLIST);
    if (writeAllowlist.length === 0) return BLOCKED;

    // Step 3: Exact match only (not prefix/suffix) — WB-R-01 defence
    if (!writeAllowlist.includes(segment)) return BLOCKED;

    return ALLOWED;
  }

  if (READ_TOOLS_WITH_COLLECTION.has(toolName)) {
    const rawCollection = args?.collection ?? args?.collectionId ?? '';
    const segment = extractCollectionSegment(rawCollection);

    // Read allowlist — fail-open when unset or empty
    const readAllowlist = parseAllowlist(process.env.COLLECTION_READ_ALLOWLIST);
    if (readAllowlist.length === 0) return ALLOWED;

    // Exact match only — WB-R-01 defence
    if (!readAllowlist.includes(segment)) return BLOCKED;

    return ALLOWED;
  }

  // list_collections (no collection arg) and unrecognised tools: permitted here
  return ALLOWED;
}
