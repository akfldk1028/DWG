import assert from "node:assert/strict";
import test from "node:test";

import { createCadGatewayServer } from "../../src/http/gateway.js";

test("assembled gateway publishes every available report and drawing export capability", async (context) => {
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
      { format: "json", kind: "report", available: true, reason: null },
      { format: "csv", kind: "report", available: true, reason: null },
      { format: "pdf", kind: "report", available: true, reason: null },
      { format: "svg", kind: "report", available: true, reason: null },
      { format: "dxf", kind: "drawing", available: true, reason: null },
      { format: "dwg", kind: "drawing", available: true, reason: null }
    ]
  });
});

test("assembled gateway issues path-free grants and serves report downloads once", async (context) => {
  const server = await createCadGatewayServer({
    workspaceRoot: process.cwd(),
    drawingPath: "tests/fixtures/dxf/minimal-architectural.dxf"
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const rejectedGrant = await fetch(`${base}/api/export/destination-grants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "C:/outside" })
  });
  assert.equal(rejectedGrant.status, 400);

  const report = await fetch(`${base}/api/export/reports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      documentId: "86be7bbdf2ca52e4",
      revision: 0,
      format: "json"
    })
  });
  assert.equal(report.status, 200);
  const response = await report.json() as { downloadId: string; filename: string };
  assert.match(response.filename, /\.json$/u);
  const first = await fetch(`${base}/api/export/reports/${response.downloadId}`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("content-type") ?? "", /^application\/json/u);
  assert.equal((await first.text()).includes("canonical"), false);
  const second = await fetch(`${base}/api/export/reports/${response.downloadId}`);
  assert.equal(second.status, 404);
});
