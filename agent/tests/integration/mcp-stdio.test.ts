import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { CAD_TOOL_NAMES } from "../../src/mcp/toolDefinitions.js";

test("serves the CAD tool surface over a spawned stdio process", async (t) => {
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "mcp", "--silent"],
    cwd: process.cwd(),
    stderr: "pipe"
  });
  const client = new Client({ name: "stdio-smoke", version: "0.1.0" });

  t.after(async () => {
    await client.close();
  });

  await client.connect(transport);
  const result = await client.listTools();

  assert.deepEqual(
    result.tools.map((tool) => tool.name).sort(),
    [...CAD_TOOL_NAMES].sort()
  );

  const opened = await client.callTool({
    name: "cad.open_drawing",
    arguments: { path: "tests/fixtures/dwg/export_sample.dwg" }
  });
  assert.equal(opened.isError, undefined);
  assert.equal(
    typeof (opened.structuredContent as { drawingId?: unknown }).drawingId,
    "string"
  );
});
