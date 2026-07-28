import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import {
  isCadEntityIndex,
  isCadEntityIndexV02
} from "@dwg/contracts";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as typeof import(
  "ajv/dist/2020.js"
).default;

const base = {
  drawingId: "dwg:test",
  source: {
    kind: "dwg",
    displayName: "test.dwg",
    parser: "acadsharp@3.6.35"
  },
  summary: {
    entityCount: 1,
    layerCount: 1,
    unsupportedCount: 0,
    modelSpaceCount: 1,
    paperSpaceCount: 0
  },
  layers: [
    {
      name: "0",
      entityCount: 1,
      visible: true,
      frozen: false
    }
  ],
  unsupported: []
};

const lineV02 = {
  ...base,
  schemaVersion: "cad-index/v0.2",
  entities: [
    {
      id: "h:1",
      handle: "1",
      type: "LINE",
      layer: "0",
      space: "model",
      layout: "Model",
      bbox: {
        min: [0, 0, 0],
        max: [10, 5, 0]
      },
      text: null,
      blockName: null,
      attributes: {},
      geometry: {
        kind: "line",
        start: [0, 0, 0],
        end: [10, 5, 0]
      },
      warnings: []
    }
  ]
};

test("accepts strict v0.2 and identifies typed geometry", () => {
  assert.equal(isCadEntityIndex(lineV02), true);
  assert.equal(isCadEntityIndexV02(lineV02), true);
});

test("retains v0.1 input compatibility", () => {
  const legacy = {
    ...lineV02,
    schemaVersion: "cad-index/v0.1",
    entities: [
      {
        ...lineV02.entities[0],
        geometry: {}
      }
    ]
  };

  assert.equal(isCadEntityIndex(legacy), true);
  assert.equal(isCadEntityIndexV02(legacy), false);
});

test("rejects malformed v0.2 geometry", () => {
  assert.equal(
    isCadEntityIndex({
      ...lineV02,
      entities: [
        {
          ...lineV02.entities[0],
          geometry: {
            kind: "line",
            start: [0, 0],
            end: [10, 5, 0]
          }
        }
      ]
    }),
    false
  );
  assert.equal(
    isCadEntityIndex({
      ...lineV02,
      entities: [
        {
          ...lineV02.entities[0],
          geometry: {
            kind: "invented",
            value: 1
          }
        }
      ]
    }),
    false
  );
});

test("JSON Schema and shared validator agree", () => {
  const schema = JSON.parse(
    readFileSync("agent/contracts/cad-index.schema.json", "utf8")
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);

  assert.equal(validate(lineV02), true);
  assert.equal(validate({
    ...lineV02,
    schemaVersion: "cad-index/v9"
  }), false);
});
