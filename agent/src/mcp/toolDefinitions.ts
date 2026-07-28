import { z } from "zod";

export const CAD_TOOL_NAMES = [
  "cad.open_drawing",
  "cad.build_index",
  "cad.get_layers",
  "cad.find_entities_by_layer",
  "cad.find_entities_by_type",
  "cad.find_text",
  "cad.get_entity",
  "cad.list_unsupported"
] as const;

export type CadToolName = (typeof CAD_TOOL_NAMES)[number];

interface CadToolDefinition {
  name: CadToolName;
  description: string;
  inputSchema: z.ZodRawShape;
}

const drawingId = z.string().min(1).describe("Drawing session ID returned by cad.open_drawing");

export const CAD_TOOL_DEFINITIONS: readonly CadToolDefinition[] = [
  {
    name: "cad.open_drawing",
    description: "Open a local DXF drawing in read-only mode and return its drawing session ID.",
    inputSchema: {
      path: z.string().min(1).describe("Local path to a DXF drawing")
    }
  },
  {
    name: "cad.build_index",
    description: "Build or retrieve the normalized versioned CAD index for an opened drawing.",
    inputSchema: { drawingId }
  },
  {
    name: "cad.get_layers",
    description: "List indexed layers and entity counts for a drawing.",
    inputSchema: { drawingId }
  },
  {
    name: "cad.find_entities_by_layer",
    description: "Find indexed CAD entities whose layer exactly matches the query.",
    inputSchema: {
      drawingId,
      layer: z.string().min(1).describe("Exact CAD layer name")
    }
  },
  {
    name: "cad.find_entities_by_type",
    description: "Find indexed CAD entities by case-insensitive entity type.",
    inputSchema: {
      drawingId,
      type: z.string().min(1).describe("CAD entity type such as LINE or TEXT")
    }
  },
  {
    name: "cad.find_text",
    description: "Find indexed TEXT or MTEXT content using substring or regular-expression matching.",
    inputSchema: {
      drawingId,
      query: z.string().min(1).describe("Text or regular expression to search for"),
      regex: z.boolean().optional().default(false)
    }
  },
  {
    name: "cad.get_entity",
    description: "Return one indexed entity by stable entity ID or CAD handle.",
    inputSchema: {
      drawingId,
      entityIdOrHandle: z.string().min(1).describe("Stable index ID or CAD handle")
    }
  },
  {
    name: "cad.list_unsupported",
    description: "List unsupported or partially parsed CAD entity types and reasons.",
    inputSchema: { drawingId }
  }
];
