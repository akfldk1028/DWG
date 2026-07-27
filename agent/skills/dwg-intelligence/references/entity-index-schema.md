# Entity Index Schema Notes

The MVP index schema is `cad-index/v0.1`.

Required entity fields:

- `id`: local stable ID, usually `h:{handle}` when the CAD handle exists
- `handle`: CAD handle when available
- `type`: CAD entity type such as `LINE`, `LWPOLYLINE`, `TEXT`, `INSERT`
- `layer`: CAD layer
- `space`: `model`, `paper`, or `unknown`
- `layout`: layout name, `Model` for model space
- `bbox`: min/max point box or null
- `text`: TEXT/MTEXT/ATTRIB content when available
- `blockName`: block name for INSERT when available
- `warnings`: parser or confidence warnings

The model must not calculate bbox, length, area, closure, intersections, or containment by itself.
