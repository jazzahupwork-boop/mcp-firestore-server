export const definition = {
  name: "list_collections",
  description:
    "List collections. Lists top-level collections by default, or subcollections of a specific document when documentPath is provided.",
  inputSchema: {
    type: "object",
    properties: {
      documentPath: {
        type: "string",
        description:
          "Optional document path to list its subcollections (e.g. 'users/uid')",
      },
    },
  },
};

export async function handler(args, db) {
  let collections;

  if (args.documentPath) {
    const docRef = db.doc(args.documentPath);
    collections = await docRef.listCollections();
  } else {
    collections = await db.listCollections();
  }

  const collectionIds = collections.map(col => col.id);

  return {
    ...(args.documentPath && { documentPath: args.documentPath }),
    collections: collectionIds,
  };
}
