import { COLLECTION_PROPERTY } from "../helpers/schema.js";

export const definition = {
  name: "delete_document",
  description:
    "Delete a document. Supports subcollection paths (e.g. 'users/uid/posts').",
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
  await db.collection(args.collection).doc(args.docId).delete();

  return {
    collection: args.collection,
    id: args.docId,
    operation: "deleted",
  };
}
