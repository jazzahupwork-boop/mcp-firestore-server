# MCP Firestore Server

A Model Context Protocol (MCP) server that provides Firestore database operations with dual-endpoint support (emulator + production).

## Installation

```bash
npx @nerd305/mcp-firestore-server
```

## Configuration

| Environment Variable | Purpose | Required? |
|---------------------|---------|-----------|
| `GOOGLE_CLOUD_PROJECT` / `FIREBASE_PROJECT_ID` | Project ID | Yes (or auto-detected from gcloud / .firebaserc) |
| `FIRESTORE_EMULATOR_HOST` | Emulator address (e.g. `127.0.0.1:8080`) | No (enables emulator target) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account key path | No (enables production target) |
| `MCP_FIRESTORE_DEFAULT_TARGET` | Default target: `"emulator"` or `"production"` | No (auto-resolved) |

At least one of `FIRESTORE_EMULATOR_HOST` or `GOOGLE_APPLICATION_CREDENTIALS` must be set. When both are configured, the server connects to both endpoints simultaneously and defaults to the emulator.

## Usage with Claude Desktop

Add to your `.mcp.json` configuration:

### Emulator only

```json
{
  "mcpServers": {
    "firestore": {
      "command": "npx",
      "args": ["-y", "@nerd305/mcp-firestore-server"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id",
        "FIRESTORE_EMULATOR_HOST": "127.0.0.1:8080"
      }
    }
  }
}
```

### Production only

```json
{
  "mcpServers": {
    "firestore": {
      "command": "npx",
      "args": ["-y", "@nerd305/mcp-firestore-server"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

### Dual-endpoint (emulator + production)

```json
{
  "mcpServers": {
    "firestore": {
      "command": "npx",
      "args": ["-y", "@nerd305/mcp-firestore-server"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id",
        "FIRESTORE_EMULATOR_HOST": "127.0.0.1:8080",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

When both are configured, use the `target` parameter on any tool to choose which endpoint to query. The default target is the emulator (override with `MCP_FIRESTORE_DEFAULT_TARGET`).

## Available Tools

All tools support an optional `target` parameter (`"emulator"` | `"production"`) and include the resolved `target` in every response. Collection paths support subcollections (e.g. `"users/uid/posts"`).

### query_collection

Query documents from a Firestore collection with pagination support.

```typescript
{
  collection: string;       // Collection path
  limit?: number;           // Default: 10
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  startAfter?: string;      // Document ID for pagination (use lastDocId from previous response)
  target?: "emulator" | "production";
}
```

### get_document

Get a specific document by ID.

```typescript
{
  collection: string;
  docId: string;
  target?: "emulator" | "production";
}
```

### query_with_where

Query documents with where conditions. Supports multiple clauses and automatic value type coercion (numbers, booleans, arrays are auto-detected from strings).

```typescript
{
  collection: string;
  // Multi-clause format (preferred)
  where?: [field: string, operator: string, value: string][];
  // Legacy single-clause format
  field?: string;
  operator?: "==" | "!=" | "<" | "<=" | ">" | ">=" | "array-contains" | "in" | "array-contains-any";
  value?: string;
  limit?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  startAfter?: string;
  target?: "emulator" | "production";
}
```

**Examples:**

```json
{ "collection": "users", "where": [["age", ">", "18"], ["status", "==", "active"]] }
{ "collection": "users", "field": "email", "operator": "==", "value": "user@example.com" }
```

### list_collections

List top-level collections or subcollections of a specific document.

```typescript
{
  documentPath?: string;    // e.g. "users/uid" to list subcollections
  target?: "emulator" | "production";
}
```

### count_documents

Count documents using Firestore's native aggregation (no document fetching). Supports optional where conditions.

```typescript
{
  collection: string;
  where?: [field: string, operator: string, value: string][];
  target?: "emulator" | "production";
}
```

### batch_get

Fetch multiple documents by ID in a single request.

```typescript
{
  collection: string;
  docIds: string[];
  target?: "emulator" | "production";
}
```

### create_document

Create a new document.

```typescript
{
  collection: string;
  docId?: string;           // Auto-generated if not provided
  data: object;
  target?: "emulator" | "production";
}
```

### update_document

Update an existing document.

```typescript
{
  collection: string;
  docId: string;
  data: object;
  merge?: boolean;          // Default: true
  target?: "emulator" | "production";
}
```

### delete_document

Delete a document.

```typescript
{
  collection: string;
  docId: string;
  target?: "emulator" | "production";
}
```

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Run locally: `npm start`

## Testing with npm link

```bash
cd mcp-firestore-server
npm link
# In your project
npm link @nerd305/mcp-firestore-server
```

## License

MIT
