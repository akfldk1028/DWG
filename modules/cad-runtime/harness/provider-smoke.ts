import assert from "node:assert/strict";
import { resolve } from "node:path";

import { buildCadIndexForPath } from "../src/application/cad-tools/runtime.js";
import { createChatService } from "../src/application/chat/chatService.js";
import { createProviderRegistry } from "../src/providers/providerRegistry.js";
import type { ProviderId } from "../src/providers/contracts.js";
import {
  createRepositoryPaths,
  createRuntimePaths,
  findRepositoryRoot
} from "../src/platform/repositoryPaths.js";

const paths = createRepositoryPaths(findRepositoryRoot(import.meta.url));
const runtimePaths = createRuntimePaths(
  paths,
  process.env.DWG_WORKSPACE,
  process.env.DWG_DRAWING_PATH
);
const workspace = runtimePaths.workspace;
const requested = process.argv[2] ?? "all";
const providerIds: ProviderId[] =
  requested === "all" ? ["codex", "claude"] : [requested as ProviderId];
const drawingPath = runtimePaths.drawingPath;
const providers = createProviderRegistry(workspace);
const service = createChatService({
  providers,
  loadIndex: (path) => buildCadIndexForPath(resolve(workspace, path))
});

for (const provider of providerIds) {
  const status = await providers.get(provider)?.getStatus();
  assert.equal(status?.authenticated, true, `${provider} must use an existing authenticated CLI session`);
  const result = await service.chat({
    provider,
    drawingPath,
    message: "이 DWG에 들어 있는 TEXT 또는 MTEXT 문자열을 간단히 나열하고 각 항목에 근거 handle을 붙여줘."
  });
  assert.ok(result.text.length > 0, `${provider} returned an empty response`);
  assert.match(result.text, /\[handle:[0-9A-F]+\]/i, `${provider} response has no CAD handle evidence`);
  assert.ok(result.sessionId, `${provider} did not return a resumable session ID`);
  const resumed = await service.chat({
    provider,
    drawingPath,
    sessionId: result.sessionId,
    message: "같은 세션을 이어서, 앞 응답에서 확인한 첫 번째 TEXT 또는 MTEXT의 handle만 [handle:값] 형식으로 다시 답해줘."
  });
  assert.equal(
    resumed.sessionId,
    result.sessionId,
    `${provider} changed the session ID while resuming`
  );
  assert.match(
    resumed.text,
    /\[handle:[0-9A-F]+\]/i,
    `${provider} resumed response has no CAD handle evidence`
  );
  console.log(JSON.stringify({
    provider,
    authMethod: status.authMethod,
    subscription: status.subscription,
    sessionId: result.sessionId,
    response: result.text,
    resumedResponse: resumed.text
  }, null, 2));
}
