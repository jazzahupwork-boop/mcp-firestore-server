import { COLLECTION_PROPERTY } from "../helpers/schema.js";

export const definition = {
  name: "update_document",
  description:
    "Update an existing document. Supports subcollection paths (e.g. 'users/uid/posts').",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      docId: { type: "string", description: "Document ID" },
      data: { type: "object", description: "Fields to update as JSON object" },
      merge: {
        type: "boolean",
        default: true,
        description: "Whether to merge with existing data (default: true)",
      },
    },
    required: ["collection", "docId", "data"],
  },
};

export async function handler(args, db) {
  const docRef = db.collection(args.collection).doc(args.docId);

  if (args.merge !== false) {
    await docRef.set(args.data, { merge: true });
  } else {
    await docRef.update(args.data);
  }

  return {
    collection: args.collection,
    id: args.docId,
    operation: "updated",
    merge: args.merge !== false,
  };
}
