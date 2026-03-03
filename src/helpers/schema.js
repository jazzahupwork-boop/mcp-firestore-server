import { WHERE_OPERATORS } from "./query.js";

/**
 * Shared schema fragments for tool definitions.
 * Prevents duplication of common property definitions across tool files.
 */

export const COLLECTION_PROPERTY = {
  type: "string",
  description: "Collection path (e.g. 'users' or 'users/uid/posts' for subcollections)",
};

export const PAGINATION_PROPERTIES = {
  limit: { type: "number", default: 10, description: "Maximum documents to return" },
  orderBy: { type: "string", description: "Field to order by" },
  orderDirection: {
    type: "string",
    enum: ["asc", "desc"],
    default: "asc",
    description: "Order direction",
  },
  startAfter: {
    type: "string",
    description:
      "Document ID to start after (for pagination). Use lastDocId from previous response.",
  },
};

export const WHERE_CLAUSES_PROPERTY = {
  type: "array",
  description:
    'Array of where clauses: [[field, operator, value], ...]. Values are auto-coerced to numbers, booleans, arrays, etc.',
  items: {
    type: "array",
    items: [
      { type: "string", description: "Field name" },
      { type: "string", enum: WHERE_OPERATORS, description: "Comparison operator" },
      { type: "string", description: "Value to compare (auto-coerced)" },
    ],
    minItems: 3,
    maxItems: 3,
  },
};
