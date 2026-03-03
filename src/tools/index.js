import * as queryCollection from "./query-collection.js";
import * as getDocument from "./get-document.js";
import * as queryWithWhere from "./query-with-where.js";
import * as listCollections from "./list-collections.js";
import * as createDocument from "./create-document.js";
import * as updateDocument from "./update-document.js";
import * as deleteDocument from "./delete-document.js";
import * as countDocuments from "./count-documents.js";
import * as batchGet from "./batch-get.js";

const tools = [
  queryCollection,
  getDocument,
  queryWithWhere,
  listCollections,
  createDocument,
  updateDocument,
  deleteDocument,
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
