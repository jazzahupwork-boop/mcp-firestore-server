/**
 * ZAPPHIRE Hermes MCP — Firestore Allowlist Unit Tests
 * UT1-UT14 (+ UT9 tool description hash)
 *
 * Run: node --test src/__tests__/allowlist.test.js
 *
 * Coverage:
 *   UT1  — Read allowlisted collection: permitted
 *   UT2  — Read non-allowlisted collection: blocked
 *   UT3  — Write to hermes-staging (in allowlist): permitted
 *   UT4  — Write to knowledge (hard-excluded, even if in allowlist): blocked
 *   UT5  — Write to okg (hard-excluded, even if in allowlist): blocked
 *   UT6  — Write to non-allowlisted collection: blocked
 *   UT7  — Read with unset COLLECTION_READ_ALLOWLIST: all reads permitted
 *   UT8  — Write with unset COLLECTION_WRITE_ALLOWLIST: all writes blocked
 *   UT9  — Tool description hash matches known-good (source derivation)
 *   UT10 — Startup fails on invalid allowlist format (illegal chars)
 *   UT10v— Whitespace-only entries: server starts, writes blocked (fail-closed)
 *   UT11 — Write to hermes-staging-extra: blocked (exact match, not prefix)
 *   UT12 — Write to Knowledge (capital K): blocked (case-normalised exclusion)
 *   UT13 — Allowlist with \r residue: trimmed correctly, write permitted
 *   UT14 — Error body: fixed string, no collection name or allowlist contents
 *
 * NOTE: These tests cover allowlist module pure functions only.
 * Integration tests (requiring live Firestore) are SS-3 validation scope.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAllowlist,
  extractCollectionSegment,
  enforceAllowlist,
  validateAllowlistConfig,
} from '../allowlist.js';

import {
  computeToolDescriptionHash,
  KNOWN_GOOD_TOOL_HASH,
} from '../integrity.js';

// Import raw tool definitions for UT9 (source-derived hash verification)
import * as queryCollection from '../tools/query-collection.js';
import * as getDocument from '../tools/get-document.js';
import * as queryWithWhere from '../tools/query-with-where.js';
import * as listCollections from '../tools/list-collections.js';
import * as createDocument from '../tools/create-document.js';
import * as updateDocument from '../tools/update-document.js';
import * as countDocuments from '../tools/count-documents.js';
import * as batchGet from '../tools/batch-get.js';

/**
 * Helper: set env vars for the duration of fn(), then restore.
 * Handles both setting and deleting (pass undefined to delete).
 */
function withEnv(vars, fn) {
  const saved = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// parseAllowlist
// ---------------------------------------------------------------------------
describe('parseAllowlist', () => {
  test('parses comma-separated values and normalises to lowercase', () => {
    assert.deepEqual(
      parseAllowlist('knowledge,okg,audit_log'),
      ['knowledge', 'okg', 'audit_log']
    );
  });

  test('trims surrounding whitespace from each entry', () => {
    assert.deepEqual(parseAllowlist(' Knowledge , OKG '), ['knowledge', 'okg']);
  });

  test('trims \\r carriage-return residue (UT13 — Windows line endings in EnvironmentFile)', () => {
    assert.deepEqual(parseAllowlist('hermes-staging\r'), ['hermes-staging']);
  });

  test('returns empty array for unset, empty, or blank value', () => {
    assert.deepEqual(parseAllowlist(undefined), []);
    assert.deepEqual(parseAllowlist(''), []);
    assert.deepEqual(parseAllowlist('   '), []);
    assert.deepEqual(parseAllowlist(null), []);
  });
});

// ---------------------------------------------------------------------------
// extractCollectionSegment
// ---------------------------------------------------------------------------
describe('extractCollectionSegment', () => {
  test('returns simple name unchanged (lowercased)', () => {
    assert.equal(extractCollectionSegment('hermes-staging'), 'hermes-staging');
  });

  test('extracts only the top-level segment from a path', () => {
    assert.equal(
      extractCollectionSegment('hermes-staging/doc123/sub'),
      'hermes-staging'
    );
  });

  test('normalises to lowercase (UT12 — case injection)', () => {
    assert.equal(extractCollectionSegment('Knowledge'), 'knowledge');
    assert.equal(extractCollectionSegment('OKG'), 'okg');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(extractCollectionSegment(' knowledge '), 'knowledge');
  });

  test('returns empty string for null, undefined, empty input', () => {
    assert.equal(extractCollectionSegment(''), '');
    assert.equal(extractCollectionSegment(undefined), '');
    assert.equal(extractCollectionSegment(null), '');
  });
});

// ---------------------------------------------------------------------------
// enforceAllowlist — read operations
// ---------------------------------------------------------------------------
describe('enforceAllowlist — reads', () => {
  // UT1: Read allowlisted collection — permitted
  test('UT1: read from allowlisted collection is permitted', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: 'knowledge,okg,audit_log' }, () => {
      const r = enforceAllowlist('query_collection', { collection: 'knowledge' });
      assert.equal(r.permitted, true);
    });
  });

  // UT2: Read non-allowlisted collection — blocked
  test('UT2: read from non-allowlisted collection is blocked', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: 'knowledge,okg,audit_log' }, () => {
      const r = enforceAllowlist('query_collection', { collection: 'hermes-staging' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT7: Unset COLLECTION_READ_ALLOWLIST — all reads permitted (fail-open)
  test('UT7: unset COLLECTION_READ_ALLOWLIST permits all reads', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: undefined }, () => {
      const r = enforceAllowlist('query_collection', { collection: 'anything' });
      assert.equal(r.permitted, true);
    });
  });

  test('get_document, query_with_where, count_documents, batch_get all respect read allowlist', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: 'knowledge' }, () => {
      for (const tool of ['get_document', 'query_with_where', 'count_documents', 'batch_get']) {
        assert.equal(
          enforceAllowlist(tool, { collection: 'knowledge' }).permitted,
          true,
          `${tool} should permit allowlisted collection`
        );
        assert.equal(
          enforceAllowlist(tool, { collection: 'other' }).permitted,
          false,
          `${tool} should block non-allowlisted collection`
        );
      }
    });
  });

  test('list_collections is always permitted at allowlist layer (no collection arg)', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: 'knowledge' }, () => {
      const r = enforceAllowlist('list_collections', {});
      assert.equal(r.permitted, true);
    });
  });
});

// ---------------------------------------------------------------------------
// enforceAllowlist — write operations
// ---------------------------------------------------------------------------
describe('enforceAllowlist — writes', () => {
  // UT3: Write to hermes-staging — permitted when in allowlist
  test('UT3: write to hermes-staging is permitted when in COLLECTION_WRITE_ALLOWLIST', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'hermes-staging' });
      assert.equal(r.permitted, true);
    });
  });

  // UT4: Write to knowledge — blocked even if in allowlist (Invariant 5)
  test('UT4: write to knowledge is blocked even when listed in COLLECTION_WRITE_ALLOWLIST', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'knowledge,hermes-staging' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'knowledge' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT5: Write to okg — blocked even if in allowlist (Invariant 5)
  test('UT5: write to okg is blocked even when listed in COLLECTION_WRITE_ALLOWLIST', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'okg,hermes-staging' }, () => {
      const r = enforceAllowlist('update_document', { collection: 'okg' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT6: Write to non-allowlisted collection
  test('UT6: write to non-allowlisted collection (not knowledge/okg) is blocked', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'audit_log' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT8: Unset COLLECTION_WRITE_ALLOWLIST — all writes blocked (fail-closed)
  test('UT8: unset COLLECTION_WRITE_ALLOWLIST blocks all writes', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: undefined }, () => {
      const r = enforceAllowlist('create_document', { collection: 'hermes-staging' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT11: Exact match — prefix variations are blocked
  test('UT11: write to hermes-staging-extra is blocked (exact match enforced, not prefix)', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'hermes-staging-extra' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT12: Case-normalised hard-exclusion
  test('UT12: write to Knowledge (capital K) is blocked by case-normalised hard-exclusion', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'Knowledge,hermes-staging' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'Knowledge' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
    });
  });

  // UT13: Windows line ending residue in env var — trim applied
  test('UT13: COLLECTION_WRITE_ALLOWLIST with \\r residue is trimmed — write succeeds', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging\r' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'hermes-staging' });
      assert.equal(r.permitted, true);
    });
  });

  test('both write tools (create_document, update_document) enforce allowlist', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging' }, () => {
      assert.equal(
        enforceAllowlist('create_document', { collection: 'hermes-staging' }).permitted,
        true
      );
      assert.equal(
        enforceAllowlist('update_document', { collection: 'hermes-staging' }).permitted,
        true
      );
      assert.equal(
        enforceAllowlist('create_document', { collection: 'knowledge' }).permitted,
        false
      );
      assert.equal(
        enforceAllowlist('update_document', { collection: 'okg' }).permitted,
        false
      );
    });
  });

  test('delete_document is NOT in write tool set — always permitted at allowlist layer', () => {
    // delete_document was removed from the fork. If somehow called:
    // it passes the allowlist layer (unknown tool) but fails at handler dispatch
    // since getHandler('delete_document') returns null.
    withEnv({ COLLECTION_WRITE_ALLOWLIST: undefined }, () => {
      const r = enforceAllowlist('delete_document', { collection: 'hermes-staging' });
      // allowlist layer: permitted (unknown write tool falls through to handler check)
      // handler layer: returns "Unknown tool" error (delete_document not registered)
      assert.equal(r.permitted, true); // allowlist doesn't block it — handler does
    });
  });
});

// ---------------------------------------------------------------------------
// Error response sanitisation — ENV-R-02 defence
// ---------------------------------------------------------------------------
describe('enforceAllowlist — error sanitisation (UT14)', () => {
  test('UT14: blocked write error reason is fixed string — no collection name or allowlist value', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging' }, () => {
      const r = enforceAllowlist('create_document', { collection: 'knowledge' });
      assert.equal(r.permitted, false);
      // Must be the exact fixed string
      assert.equal(r.reason, 'Collection not permitted');
      // Must NOT contain the requested collection name
      assert.ok(!r.reason.includes('knowledge'), 'Error must not expose collection name');
      // Must NOT contain the allowlist contents
      assert.ok(!r.reason.includes('hermes-staging'), 'Error must not expose allowlist contents');
    });
  });

  test('UT14 (read): blocked read error reason is fixed string', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: 'knowledge,okg' }, () => {
      const r = enforceAllowlist('query_collection', { collection: 'hermes-staging' });
      assert.equal(r.permitted, false);
      assert.equal(r.reason, 'Collection not permitted');
      assert.ok(!r.reason.includes('hermes-staging'), 'Error must not expose collection name');
      assert.ok(!r.reason.includes('knowledge'), 'Error must not expose allowlist contents');
    });
  });
});

// ---------------------------------------------------------------------------
// validateAllowlistConfig — startup validation (UT10)
// ---------------------------------------------------------------------------
describe('validateAllowlistConfig (UT10)', () => {
  test('UT10: throws on COLLECTION_WRITE_ALLOWLIST with path traversal characters', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes-staging/../knowledge' }, () => {
      assert.throws(
        () => validateAllowlistConfig(),
        (err) => {
          assert.ok(err.message.includes('[ALLOWLIST]'), 'Should be an allowlist error');
          assert.ok(err.message.includes('Invalid entry'), 'Should mention invalid entry');
          return true;
        }
      );
    });
  });

  test('UT10: throws on COLLECTION_READ_ALLOWLIST with dot separator', () => {
    withEnv({ COLLECTION_READ_ALLOWLIST: 'knowledge.okg' }, () => {
      assert.throws(() => validateAllowlistConfig(), /Invalid entry/);
    });
  });

  test('UT10: throws on entry containing a space', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: 'hermes staging' }, () => {
      assert.throws(() => validateAllowlistConfig(), /Invalid entry/);
    });
  });

  test('UT10 variant: whitespace-only entries do NOT throw (server starts, writes fail-closed)', () => {
    withEnv({ COLLECTION_WRITE_ALLOWLIST: ' , , ' }, () => {
      assert.doesNotThrow(() => validateAllowlistConfig());
      // Writes blocked — empty allowlist after parse
      const r = enforceAllowlist('create_document', { collection: 'hermes-staging' });
      assert.equal(r.permitted, false);
    });
  });

  test('UT10: accepts valid collection names', () => {
    withEnv({
      COLLECTION_WRITE_ALLOWLIST: 'hermes-staging',
      COLLECTION_READ_ALLOWLIST: 'knowledge,okg,audit_log',
    }, () => {
      assert.doesNotThrow(() => validateAllowlistConfig());
    });
  });

  test('unset env vars pass validation without issue', () => {
    withEnv({
      COLLECTION_WRITE_ALLOWLIST: undefined,
      COLLECTION_READ_ALLOWLIST: undefined,
    }, () => {
      assert.doesNotThrow(() => validateAllowlistConfig());
    });
  });
});

// ---------------------------------------------------------------------------
// Tool description integrity hash (UT9)
// ---------------------------------------------------------------------------
describe('tool description integrity (UT9)', () => {
  test('UT9: computed hash from source definitions matches known-good constant', () => {
    // Use raw definitions (not getToolDefinitions which injects target property).
    // Hash uses only name + description fields — consistent with integrity.js.
    // delete_document is NOT included (removed from fork per D2).
    const rawDefs = [
      queryCollection.definition,
      getDocument.definition,
      queryWithWhere.definition,
      listCollections.definition,
      createDocument.definition,
      updateDocument.definition,
      countDocuments.definition,
      batchGet.definition,
    ];

    const computed = computeToolDescriptionHash(rawDefs);
    assert.equal(
      computed,
      KNOWN_GOOD_TOOL_HASH,
      `Tool description hash mismatch.\n` +
      `Expected: ${KNOWN_GOOD_TOOL_HASH}\n` +
      `Computed: ${computed}\n` +
      `A tool name or description has changed. Update KNOWN_GOOD_TOOL_HASH in src/integrity.js.`
    );
  });

  test('UT9: hash is stable across multiple calls (deterministic)', () => {
    const defs = [
      batchGet.definition,
      createDocument.definition,
    ];
    assert.equal(
      computeToolDescriptionHash(defs),
      computeToolDescriptionHash(defs)
    );
  });

  test('UT9: hash changes if a description is modified', () => {
    const original = [{ name: 'test_tool', description: 'original description' }];
    const modified = [{ name: 'test_tool', description: 'tampered description' }];
    assert.notEqual(
      computeToolDescriptionHash(original),
      computeToolDescriptionHash(modified)
    );
  });

  test('UT9: hash changes if a tool is added', () => {
    const before = [{ name: 'tool_a', description: 'desc a' }];
    const after = [
      { name: 'tool_a', description: 'desc a' },
      { name: 'tool_b', description: 'desc b' },
    ];
    assert.notEqual(
      computeToolDescriptionHash(before),
      computeToolDescriptionHash(after)
    );
  });
});
