import { COLLECTION_PROPERTY } from "../helpers/schema.js";
import { mapDocSnapshot } from "../helpers/query.js";

export const definition = {
  name: "batch_get",
  description:
    "Fetch multiple documents by ID in a single request. Uses Firestore's getAll() for efficiency. Supports subcollection paths.",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      docIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of document IDs to fetch",
      },
    },
    required: ["collection", "docIds"],
  },
};

export async function handler(args, db) {
  const refs = args.docIds.map(id => db.collection(args.collection).doc(id));
  const snapshots = await db.getAll(...refs);
  const docs = snapshots.map(mapDocSnapshot);

  return {
    collection: args.collection,
    count: docs.filter(d => d.exists).length,
    requested: args.docIds.length,
    documents: docs,
  };
}
