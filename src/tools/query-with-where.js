import { coerceValue } from "../helpers/coerce-value.js";
import {
  COLLECTION_PROPERTY,
  PAGINATION_PROPERTIES,
  WHERE_CLAUSES_PROPERTY,
} from "../helpers/schema.js";
import {
  WHERE_OPERATORS,
  applyWhereClauses,
  applyOrderBy,
  applyPagination,
  executeQuery,
} from "../helpers/query.js";

export const definition = {
  name: "query_with_where",
  description:
    "Query a collection with where conditions. Supports single or multiple clauses, value type coercion, and pagination. Supports subcollection paths.",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      where: WHERE_CLAUSES_PROPERTY,
      // Legacy single-clause format (backward compat)
      field: {
        type: "string",
        description: "Field to filter on (legacy single-clause format)",
      },
      operator: {
        type: "string",
        enum: WHERE_OPERATORS,
        description: "Comparison operator (legacy single-clause format)",
      },
      value: {
        type: "string",
        description:
          "Value to compare (legacy single-clause format). Numbers, booleans, and arrays are auto-coerced.",
      },
      ...PAGINATION_PROPERTIES,
    },
    required: ["collection"],
  },
};

export async function handler(args, db) {
  let query = db.collection(args.collection);
  let clauses;

  if (args.where && Array.isArray(args.where)) {
    // Multi-clause format: [[field, op, value], ...]
    ({ query, clauses } = applyWhereClauses(query, args.where));
  } else if (args.field && args.operator && args.value !== undefined) {
    // Legacy single-clause format
    const coerced = coerceValue(args.value);
    clauses = [{ field: args.field, operator: args.operator, value: coerced }];
    query = query.where(args.field, args.operator, coerced);
  } else {
    throw new Error(
      "Provide either 'where' array or 'field'/'operator'/'value' parameters.",
    );
  }

  query = applyOrderBy(query, args);
  query = await applyPagination(query, db, args.collection, args.startAfter);

  const { docs, lastDocId } = await executeQuery(query, args.limit);

  return {
    collection: args.collection,
    query: clauses.map(c => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`).join(" AND "),
    count: docs.length,
    documents: docs,
    ...(lastDocId && { lastDocId }),
  };
}
