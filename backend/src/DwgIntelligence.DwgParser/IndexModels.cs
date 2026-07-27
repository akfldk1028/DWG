namespace DwgIntelligence.DwgParser;

public sealed record CadIndex(
    string SchemaVersion,
    string DrawingId,
    CadIndexSource Source,
    CadIndexSummary Summary,
    IReadOnlyList<CadLayerItem> Layers,
    IReadOnlyList<CadEntityItem> Entities,
    IReadOnlyList<UnsupportedCadEntity> Unsupported);

public sealed record CadIndexSource(
    string Kind,
    string DisplayName,
    string Parser);

public sealed record CadIndexSummary(
    int EntityCount,
    int LayerCount,
    int UnsupportedCount,
    int ModelSpaceCount,
    int PaperSpaceCount);

public sealed record CadLayerItem(
    string Name,
    int EntityCount,
    bool Visible,
    bool Frozen);

public sealed record CadBoundingBox(
    double[] Min,
    double[] Max);

public sealed record CadEntityItem(
    string Id,
    string? Handle,
    string Type,
    string Layer,
    string Space,
    string Layout,
    CadBoundingBox? Bbox,
    string? Text,
    string? BlockName,
    IReadOnlyDictionary<string, string> Attributes,
    IReadOnlyDictionary<string, object?> Geometry,
    IReadOnlyList<string> Warnings);

public sealed record UnsupportedCadEntity(
    string Type,
    int Count,
    string Reason);
