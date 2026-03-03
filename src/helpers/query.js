import { coerceValue } from "./coerce-value.js";

/**
 * Valid Firestore where operators.
 */
export const WHERE_OPERATORS = [
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "array-contains",
  "in",
  "array-contains-any",
];

/**
 * Apply where clauses to a Firestore query.
 * Returns { query, clauses } where clauses is the parsed array for response building.
 */
export function applyWhereClauses(query, whereClauses) {
  const clauses = [];
  for (const clause of whereClauses) {
    const [field, operator, value] = clause;
    const coerced = coerceValue(value);
    clauses.push({ field, operator, value: coerced });
    query = query.where(field, operator, coerced);
  }
  return { query, clauses };
}

/**
 * Apply orderBy to a query if specified.
 */
export function applyOrderBy(query, args) {
  if (args.orderBy) {
    query = query.orderBy(args.orderBy, args.orderDirection || "asc");
  }
  return query;
}

/**
 * Apply startAfter pagination cursor to a query.
 * Fetches the cursor document and applies it. If the doc doesn't exist,
 * the cursor is silently skipped (document may have been deleted between pages).
 */
export async function applyPagination(query, db, collection, startAfterId) {
  if (!startAfterId) return query;
  const startDoc = await db.collection(collection).doc(startAfterId).get();
  if (startDoc.exists) {
    query = query.startAfter(startDoc);
  }
  return query;
}

/**
 * Execute a query with limit and map results to plain objects.
 * Returns { docs, lastDocId } for response building.
 */
export async function executeQuery(query, limit) {
  const snapshot = await query.limit(limit || 10).get();

  const docs = snapshot.docs.map(doc => ({
    id: doc.id,
    data: doc.data(),
  }));

  const lastDocId = docs.length > 0 ? docs[docs.length - 1].id : null;

  return { docs, lastDocId };
}

/**
 * Map a document snapshot to a plain object (with exists check).
 * Used for get_document and batch_get where docs may not exist.
 */
export function mapDocSnapshot(doc) {
  return {
    id: doc.id,
    exists: doc.exists,
    data: doc.exists ? doc.data() : null,
  };
}
