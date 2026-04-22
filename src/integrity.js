/**
 * ZAPPHIRE Hermes MCP — Tool Description Integrity Verification
 * Fork: jazzahupwork-boop/mcp-firestore-server v2.0.1-zapphire1
 * Spec: spec-hermes-mcp-connector-architecture-v1 V1.2 — Invariant 9
 *
 * Defends against tool description tampering (R15/R16/R17 in spec red team).
 *
 * HASH DERIVATION PROCEDURE (SC-R-01 compliance):
 * Hash is computed from SOURCE CODE (static description strings), NOT from
 * a running server instance. The hash below was derived at commit time by:
 *
 *   1. Collecting all tool definitions from src/tools/ (8 tools after fork)
 *   2. Sorting entries by tool name (alphabetical)
 *   3. Concatenating: name + description for each sorted entry
 *   4. SHA256(concatenated_string, encoding='utf-8')
 *
 * Tool inventory at hash derivation (sorted):
 *   batch_get         — "Fetch multiple documents by ID..."
 *   count_documents   — "Count documents in a collection..."
 *   create_document   — "Create a new document..."
 *   get_document      — "Get a specific document by ID..."
 *   list_collections  — "List collections. Lists top-level..."
 *   query_collection  — "Query a Firestore collection..."
 *   query_with_where  — "Query a collection with where conditions..."
 *   update_document   — "Update an existing document..."
 *
 * NOTE: delete_document was REMOVED in this fork (D2 Director decision).
 * If delete_document is re-added, this hash MUST be recomputed.
 *
 * Verification script: zapphireIaC/scripts/hermes/verify-mcp-descriptions
 */

import { createHash } from 'crypto';

/**
 * Known-good SHA256 of sorted tool (name + description) concatenation.
 * Derived from source at this commit. Replaces on any tool description change.
 *
 * Commit: SS-B 2026-04-23 (Phase 2 GPG signing will embed exact commit SHA)
 */
export const KNOWN_GOOD_TOOL_HASH =
  'a49a5d404a0fd8b781b8fe01ed391d5dbc7d36f97acb093a73792d2895e79619';

/**
 * Compute SHA256 of sorted tool (name + description) concatenation.
 *
 * @param {Array<{name: string, description: string}>} toolDefinitions
 * @returns {string} hex digest
 */
export function computeToolDescriptionHash(toolDefinitions) {
  const sorted = [...toolDefinitions]
    .sort((a, b) => a.name.localeCompare(b.name));
  const input = sorted
    .map(t => t.name + t.description)
    .join('');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Verify tool descriptions match the known-good hash.
 * Throws if mismatch — server startup aborts.
 *
 * Called after getToolDefinitions() in startServer().
 * Provides defence against tool description tampering between install and start.
 *
 * @param {Array<{name: string, description: string}>} toolDefinitions
 * @throws {Error} on hash mismatch
 */
export function verifyToolDescriptionHash(toolDefinitions) {
  const computed = computeToolDescriptionHash(toolDefinitions);
  if (computed !== KNOWN_GOOD_TOOL_HASH) {
    throw new Error(
      `[INTEGRITY] Tool description hash mismatch detected at startup. ` +
      `Expected: ${KNOWN_GOOD_TOOL_HASH}. ` +
      `Computed:  ${computed}. ` +
      `This indicates tool descriptions have been modified after the ` +
      `integrity hash was set. Halting — do not operate a compromised server.`
    );
  }
  console.error('[INTEGRITY] Tool description hash verified OK');
  return true;
}
