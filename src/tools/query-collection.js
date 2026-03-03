import { COLLECTION_PROPERTY, PAGINATION_PROPERTIES } from "../helpers/schema.js";
import { applyOrderBy, applyPagination, executeQuery } from "../helpers/query.js";

export const definition = {
  name: "query_collection",
  description:
    "Query a Firestore collection. Supports subcollection paths (e.g. 'users/uid/posts').",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      ...PAGINATION_PROPERTIES,
    },
    required: ["collection"],
  },
};

export async function handler(args, db) {
  let query = db.collection(args.collection);
  query = applyOrderBy(query, args);
  query = await applyPagination(query, db, args.collection, args.startAfter);

  const { docs, lastDocId } = await executeQuery(query, args.limit);

  return {
    collection: args.collection,
    count: docs.length,
    documents: docs,
    ...(lastDocId && { lastDocId }),
  };
}
