import assert from "node:assert/strict";
import test from "node:test";

import { createCadGatewayServer } from "../../src/http/gateway.js";

test("assembled gateway publishes every unavailable report and drawing export capability", async (context) => {
  const server = await createCadGatewayServer({
    workspaceRoot: process.cwd(),
    drawingPath: "tests/fixtures/dxf/minimal-architectural.dxf"
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/export/capabilities`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    capabilities: [
      { format: "json", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
      { format: "csv", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
      { format: "pdf", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
      { format: "svg", kind: "report", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
      { format: "dxf", kind: "drawing", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" },
      { format: "dwg", kind: "drawing", available: false, reason: "EXPORT_MODULE_NOT_INSTALLED" }
    ]
  });
});
