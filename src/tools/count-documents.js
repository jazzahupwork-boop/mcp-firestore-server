import { COLLECTION_PROPERTY, WHERE_CLAUSES_PROPERTY } from "../helpers/schema.js";
import { applyWhereClauses } from "../helpers/query.js";

export const definition = {
  name: "count_documents",
  description:
    "Count documents in a collection with optional where conditions. Uses Firestore's native count() aggregation (no document fetching). Supports subcollection paths.",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      where: WHERE_CLAUSES_PROPERTY,
    },
    required: ["collection"],
  },
};

export async function handler(args, db) {
  let query = db.collection(args.collection);

  if (args.where && Array.isArray(args.where)) {
    ({ query } = applyWhereClauses(query, args.where));
  }

  const snapshot = await query.count().get();

  return {
    collection: args.collection,
    count: snapshot.data().count,
    ...(args.where && { where: args.where }),
  };
}
