import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isProviderChatPayload } from "@dwg/contracts";

import type {
  GroundedChatRequest
} from "../application/chat/chatService.js";
import type {
  ProviderChatResult,
  ProviderStatus
} from "../providers/contracts.js";

const maxBodyBytes = 64 * 1024;

interface GatewayDependencies {
  getStatuses(): Promise<ProviderStatus[]>;
  chat(request: GroundedChatRequest, signal?: AbortSignal): Promise<ProviderChatResult>;
}

export function createProviderGateway(dependencies: GatewayDependencies) {
  return createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { ok: true, service: "dwg-provider-gateway" });
      }
      if (request.method === "GET" && url.pathname === "/api/providers") {
        return sendJson(response, 200, { providers: await dependencies.getStatuses() });
      }
      if (request.method === "POST" && url.pathname === "/api/chat") {
        const body = await readJsonBody(request);
        if (!isProviderChatPayload(body)) {
          return sendJson(response, 400, { error: "Invalid chat request" });
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        request.once("aborted", abort);
        response.once("close", () => {
          if (!response.writableEnded) abort();
        });
        return sendJson(
          response,
          200,
          await dependencies.chat(body, controller.signal)
        );
      }
      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected gateway error";
      const status = /invalid|malformed|unsupported|required|exceeds/i.test(message) ? 400 : 500;
      return sendJson(response, status, { error: message });
    }
  });
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        reject(new Error("Request exceeds 64KB"));
        request.destroy();
        return;
      }
      text += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Malformed JSON request"));
      }
    });
    request.on("error", reject);
  });
}

function setSecurityHeaders(response: ServerResponse) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed) return;
  response.statusCode = status;
  response.end(JSON.stringify(value));
}
