import type { IncomingMessage, ServerResponse } from "node:http";

import {
  parseDestinationGrantRequest,
  parseDestinationGrantResponse
} from "@dwg/contracts";

import type { CadApplication } from "../application/createCadApplication.js";

export async function handleDestinationGrantRequest(
  request: IncomingMessage,
  response: ServerResponse,
  application: CadApplication,
  readBody: (request: IncomingMessage) => Promise<unknown>,
  signal?: AbortSignal
): Promise<boolean> {
  if (request.method !== "POST") return false;
  parseDestinationGrantRequest(await readBody(request));
  const grant = await application.requestDestinationGrant(signal);
  response.setHeader("content-type", "application/json; charset=utf-8");
  if (!grant) {
    response.statusCode = 409;
    response.end(JSON.stringify({ error: "DESTINATION_SELECTION_CANCELLED" }));
  } else {
    response.statusCode = 200;
    response.end(JSON.stringify(parseDestinationGrantResponse(grant)));
  }
  return true;
}
