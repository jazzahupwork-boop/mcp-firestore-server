import { COLLECTION_PROPERTY } from "../helpers/schema.js";

export const definition = {
  name: "create_document",
  description:
    "Create a new document in a collection. Supports subcollection paths (e.g. 'users/uid/posts').",
  inputSchema: {
    type: "object",
    properties: {
      collection: COLLECTION_PROPERTY,
      docId: {
        type: "string",
        description:
          "Optional document ID. If not provided, Firestore will auto-generate one.",
      },
      data: {
        type: "object",
        description: "Document data as JSON object",
      },
    },
    required: ["collection", "data"],
  },
};

export async function handler(args, db) {
  const collectionRef = db.collection(args.collection);
  let docRef;

  if (args.docId) {
    docRef = collectionRef.doc(args.docId);
    await docRef.set(args.data);
  } else {
    docRef = await collectionRef.add(args.data);
  }

  return {
    collection: args.collection,
    id: docRef.id,
    operation: "created",
  };
}
