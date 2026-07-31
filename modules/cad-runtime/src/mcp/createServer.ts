import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { CadCapabilityRuntime } from "@dwg/cad-capabilities";
import {
  parseCadDrawingExportResponse,
  parseCadOutputVerification,
  parseCadReportExportResponse,
  type CadReportExportResponse
} from "@dwg/contracts";

import { executeCadTool } from "../application/cad-tools/runtime.js";
import { CAD_TOOL_DEFINITIONS } from "./toolDefinitions.js";

type ToolArguments = Record<string, unknown>;

export function createCadMcpServer(
  runtime: CadCapabilityRuntime,
  services: {
    requestDestinationGrant?(signal?: AbortSignal): Promise<unknown>;
    createReportDownload?(input: unknown, signal?: AbortSignal): Promise<CadReportExportResponse>;
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
      async (args, extra) => {
        try {
          const result = definition.name === "cad_request_export_destination"
            ? await requestExportDestination(server, services, extra.signal)
            : definition.name === "cad_export_report"
              ? await requestReportDownload(services, args, extra.signal)
              : definition.name === "cad_export_drawing"
                ? publicDrawingResponse(await executeCadTool(
                    runtime,
                    definition.name,
                    args as ToolArguments,
                    extra.signal
                  ))
                : await executeCadTool(
                runtime,
                definition.name,
                args as ToolArguments,
                extra.signal
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
    createReportDownload?(input: unknown, signal?: AbortSignal): Promise<CadReportExportResponse>;
    displayDirectory?: string;
  },
  signal?: AbortSignal
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
      required: ["confirm"],
      additionalProperties: false
    }
  } as Parameters<typeof server.server.elicitInput>[0], { signal });
  if (
    elicitation.action !== "accept" ||
    !elicitation.content ||
    !isExactConfirmation(elicitation.content)
  ) {
    throw new Error("DESTINATION_SELECTION_CANCELLED");
  }
  const grant = await services.requestDestinationGrant(signal);
  if (!grant) throw new Error("DESTINATION_SELECTION_CANCELLED");
  return grant;
}

async function requestReportDownload(
  services: {
    createReportDownload?(input: unknown, signal?: AbortSignal): Promise<CadReportExportResponse>;
  },
  input: unknown,
  signal?: AbortSignal
): Promise<CadReportExportResponse> {
  if (!services.createReportDownload) throw new Error("MCP_REPORT_DOWNLOAD_UNSUPPORTED");
  return parseCadReportExportResponse(await services.createReportDownload(input, signal));
}

function publicDrawingResponse(value: unknown) {
  const verification = parseCadOutputVerification(value);
  return parseCadDrawingExportResponse({
    verificationId: verification.id,
    status: verification.status
  });
}

function isExactConfirmation(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "confirm" && value.confirm === true;
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value };
  }
  return value as Record<string, unknown>;
}
