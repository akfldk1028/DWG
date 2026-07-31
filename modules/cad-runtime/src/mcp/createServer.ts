import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { CadCapabilityRuntime } from "@dwg/cad-capabilities";

import { executeCadTool } from "../application/cad-tools/runtime.js";
import { CAD_TOOL_DEFINITIONS } from "./toolDefinitions.js";

type ToolArguments = Record<string, unknown>;

export function createCadMcpServer(
  runtime: CadCapabilityRuntime,
  services: {
    requestDestinationGrant?(signal?: AbortSignal): Promise<unknown>;
    displayDirectory?: string;
  } = {}
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
          readOnlyHint: !definition.name.includes("export_drawing")
            && definition.name !== "cad_request_export_destination",
          destructiveHint: false,
          idempotentHint: !definition.name.includes("export_drawing")
            && definition.name !== "cad_request_export_destination",
          openWorldHint: false
        }
      },
      async (args) => {
        try {
          const result = definition.name === "cad_request_export_destination"
            ? await requestExportDestination(server, services)
            : await executeCadTool(
                runtime,
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

async function requestExportDestination(
  server: McpServer,
  services: {
    requestDestinationGrant?(signal?: AbortSignal): Promise<unknown>;
    displayDirectory?: string;
  }
): Promise<unknown> {
  if (
    !services.requestDestinationGrant ||
    !server.server.getClientCapabilities()?.elicitation?.form
  ) {
    throw new Error("MCP_ELICITATION_UNSUPPORTED");
  }
  const elicitation = await server.server.elicitInput({
    mode: "form",
    message: `Create a one-use export grant for ${services.displayDirectory ?? "the host export directory"}?`,
    requestedSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          title: "Confirm export destination"
        }
      },
      required: ["confirm"]
    }
  });
  if (
    elicitation.action !== "accept" ||
    !elicitation.content ||
    elicitation.content.confirm !== true
  ) {
    throw new Error("DESTINATION_SELECTION_CANCELLED");
  }
  const grant = await services.requestDestinationGrant();
  if (!grant) throw new Error("DESTINATION_SELECTION_CANCELLED");
  return grant;
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value };
  }
  return value as Record<string, unknown>;
}
