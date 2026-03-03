import { COLLECTION_PROPERTY } from "../helpers/schema.js";
import { mapDocSnapshot } from "../helpers/query.js";

export const definition = {
  name: "get_document",
  description:
    "Get a specific document by ID. Supports subcollection paths (e.g. 'users/uid/posts').",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      docId: { type: "string", description: "Document ID" },
    },
    required: ["collection", "docId"],
  },
};

export async function handler(args, db) {
  const doc = await db.collection(args.collection).doc(args.docId).get();
  return mapDocSnapshot(doc);
}
