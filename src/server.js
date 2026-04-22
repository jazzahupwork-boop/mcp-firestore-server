import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initFirebase, getDb } from "./firebase.js";
import { getToolDefinitions, getHandler } from "./tools/index.js";
import { buildResponse, buildErrorResponse } from "./helpers/response.js";
import { enforceAllowlist, validateAllowlistConfig } from "./allowlist.js";
import { verifyToolDescriptionHash } from "./integrity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));

/** Connection test timeout in milliseconds. */
const CONNECTION_TEST_TIMEOUT_MS = 10_000;

/**
 * Test a single Firestore connection with a timeout.
 */
async function testConnection(target) {
  const { db } = getDb(target);
  const testQuery = db.collection("_test_connection").limit(1).get();
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Connection test timed out")), CONNECTION_TEST_TIMEOUT_MS),
  );
  await Promise.race([testQuery, timeout]);
}

export async function startServer() {
  try {
    console.error("Starting Firestore MCP Server...");

    // ZAPPHIRE: Validate allowlist env var format before any other init.
    // Throws on invalid format (e.g. path traversal characters in collection names).
    // Process exits via catch block below. Satisfies UT10.
    validateAllowlistConfig();
    console.error("[ALLOWLIST] Configuration validated");

    // Initialize Firebase with dual-endpoint support
    const { defaultTarget, availableTargets } = initFirebase();

    // Test connections in parallel with timeout
    await Promise.allSettled(
      availableTargets.map(async target => {
        try {
          await testConnection(target);
          console.error(`[${target}] Connection verified`);
        } catch (error) {
          console.error(`[${target}] Connection test failed: ${error.message}`);
          if (target === "emulator") {
            console.error(
              `Make sure the Firestore emulator is running on ${process.env.FIRESTORE_EMULATOR_HOST}`,
            );
          }
        }
      }),
    );

    // Cache tool definitions (immutable after init)
    const toolDefinitions = getToolDefinitions(availableTargets, defaultTarget);

    // ZAPPHIRE: Verify tool description integrity at startup — Invariant 9.
    // Throws and aborts if descriptions have been tampered with.
    verifyToolDescriptionHash(toolDefinitions);

    const server = new Server(
      {
        name: "firestore-mcp-server",
        version: pkg.version,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    console.error("MCP Server instance created");

    // Register tool definitions (cached, not rebuilt per request)
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

    console.error("Tools registered");

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      console.error(`Tool called: ${name}`);

      // ZAPPHIRE: Enforce collection allowlist BEFORE handler dispatch.
      // Returns fixed sanitised error — never exposes collection name or
      // allowlist contents in response body (ENV-R-02 defence).
      const allowlistResult = enforceAllowlist(name, args);
      if (!allowlistResult.permitted) {
        return buildErrorResponse(new Error(allowlistResult.reason));
      }

      try {
        const handler = getHandler(name);
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const { db, target } = getDb(args.target);
        const result = await handler(args, db);

        return buildResponse({ ...result, target });
      } catch (error) {
        console.error("Tool execution error:", error);
        return buildErrorResponse(error);
      }
    });

    console.error("Request handlers set up");

    // Create transport
    const transport = new StdioServerTransport();
    console.error("Transport created, connecting...");

    transport.onclose = () => {
      console.error("Transport closed");
    };

    transport.onerror = error => {
      console.error("Transport error:", error);
    };

    await server.connect(transport);
    console.error("Firestore MCP Server started successfully and connected");

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}
