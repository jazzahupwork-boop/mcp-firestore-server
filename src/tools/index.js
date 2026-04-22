import * as queryCollection from "./query-collection.js";
import * as getDocument from "./get-document.js";
import * as queryWithWhere from "./query-with-where.js";
import * as listCollections from "./list-collections.js";
import * as createDocument from "./create-document.js";
import * as updateDocument from "./update-document.js";
// NOTE: deleteDocument intentionally omitted.
// D2 Director decision — SS-B 2026-04-23:
// Deletion is Night Manager scope only. Hermes flags items for deletion by
// setting a status field in hermes-staging; the Night Manager executes the
// actual Firestore delete. This structural removal eliminates the entire
// delete attack surface from the Hermes agent layer.
import * as countDocuments from "./count-documents.js";
import * as batchGet from "./batch-get.js";

const tools = [
  queryCollection,
  getDocument,
  queryWithWhere,
  listCollections,
  createDocument,
  updateDocument,
  // delete_document: removed — see note above
  countDocuments,
  batchGet,
];

/**
 * Get tool definitions with the `target` parameter injected into each tool.
 */
export function getToolDefinitions(availableTargets, defaultTarget) {
  return tools.map(tool => ({
    ...tool.definition,
    inputSchema: {
      ...tool.definition.inputSchema,
      properties: {
        ...tool.definition.inputSchema.properties,
        target: {
          type: "string",
          enum: availableTargets,
          description: `Firestore target endpoint (default: "${defaultTarget}")`,
        },
      },
    },
  }));
}

/**
 * Get handler function for a tool by name.
 */
const handlerMap = Object.fromEntries(
  tools.map(tool => [tool.definition.name, tool.handler]),
);

export function getHandler(toolName) {
  return handlerMap[toolName] || null;
}
