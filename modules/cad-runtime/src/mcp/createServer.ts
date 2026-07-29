import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createCadToolRuntime } from "../application/cad-tools/runtime.js";
import { CAD_TOOL_DEFINITIONS } from "./toolDefinitions.js";

type ToolArguments = Record<string, unknown>;

export interface CadToolRuntime {
  call(name: string, args: ToolArguments): Promise<unknown>;
}

export function createCadMcpServer(
  runtime: CadToolRuntime = createCadToolRuntime()
): McpServer {
  const server = new McpServer({
    name: "dwg-intelligence",
    version: "0.1.0"
  });

  for (const definition of CAD_TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async (args) => {
        try {
          const result = await runtime.call(
            definition.name,
            args as ToolArguments
          );
          const structuredContent = asStructuredContent(result);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(structuredContent)
              }
            ],
            structuredContent
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const structuredContent = {
            error: {
              code: "CAD_TOOL_ERROR",
              message
            }
          };
          return {
            content: [
              {
                type: "text" as const,
                text: message
              }
            ],
            structuredContent,
            isError: true
          };
        }
      }
    );
  }

  return server;
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value };
  }
  return value as Record<string, unknown>;
}
