using System.Security.Cryptography;
using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using CSMath;

namespace DwgIntelligence.DwgParser;

public static class DwgIndexBuilder
{
    public static CadIndex Build(string path)
    {
        string fullPath = Path.GetFullPath(path);
        CadDocument document = DwgReader.Read(fullPath);
        var unsupported = new Dictionary<(string Type, string Reason), int>();
        var entities = new List<CadEntityItem>();

        int entityIndex = 0;
        foreach (Entity entity in document.Entities)
        {
            entities.Add(ConvertEntity(entity, entityIndex, unsupported));
            entityIndex += 1;
        }

        IReadOnlyList<CadLayerItem> layers = document.Layers
            .Select(layer => new CadLayerItem(
                layer.Name,
                entities.Count(entity => entity.Layer == layer.Name),
                layer.IsOn,
                layer.Flags.HasFlag(LayerFlags.Frozen)))
            .OrderBy(layer => layer.Name, StringComparer.Ordinal)
            .ToArray();

        IReadOnlyList<UnsupportedCadEntity> unsupportedItems = unsupported
            .OrderBy(item => item.Key.Type, StringComparer.Ordinal)
            .ThenBy(item => item.Key.Reason, StringComparer.Ordinal)
            .Select(item => new UnsupportedCadEntity(
                item.Key.Type,
                item.Value,
                item.Key.Reason))
            .ToArray();

        return new CadIndex(
            "cad-index/v0.1",
            CreateDrawingId(fullPath),
            new CadIndexSource(
                "dwg",
                Path.GetFileName(fullPath),
                "acadsharp@3.6.35"),
            new CadIndexSummary(
                entities.Count,
                layers.Count,
                unsupportedItems.Sum(item => item.Count),
                entities.Count,
                0),
            layers,
            entities,
            unsupportedItems);
    }

    private static CadEntityItem ConvertEntity(
        Entity entity,
        int entityIndex,
        IDictionary<(string Type, string Reason), int> unsupported)
    {
        string type = string.IsNullOrWhiteSpace(entity.ObjectName)
            ? entity.GetType().Name.ToUpperInvariant()
            : entity.ObjectName;
        string? handle = entity.Handle == 0
            ? null
            : entity.Handle.ToString("X");
        string id = handle is null
            ? $"generated:{type}:{entityIndex}"
            : $"h:{handle}";
        var warnings = new List<string>();
        CadBoundingBox? bbox = GetBoundingBox(entity, type, warnings, unsupported);

        if (handle is null)
        {
            warnings.Add("missing-handle");
            AddUnsupported(unsupported, type, "missing-handle");
        }

        return new CadEntityItem(
            id,
            handle,
            type,
            entity.Layer?.Name ?? "0",
            "model",
            "Model",
            bbox,
            entity is IText text ? text.Value : null,
            entity is Insert insert ? insert.Block?.Name : null,
            new Dictionary<string, string>(),
            new UnavailableGeometry(
                "unavailable",
                "geometry-not-extracted"),
            warnings);
    }

    private static CadBoundingBox? GetBoundingBox(
        Entity entity,
        string type,
        ICollection<string> warnings,
        IDictionary<(string Type, string Reason), int> unsupported)
    {
        try
        {
            BoundingBox box = entity.GetBoundingBox();
            double[] min = [box.Min.X, box.Min.Y, box.Min.Z];
            double[] max = [box.Max.X, box.Max.Y, box.Max.Z];
            if (min.Concat(max).Any(value => !double.IsFinite(value)))
            {
                warnings.Add("bbox-unavailable");
                AddUnsupported(unsupported, type, "bbox-unavailable");
                return null;
            }
            return new CadBoundingBox(min, max);
        }
        catch (NotImplementedException)
        {
            warnings.Add("bbox-not-implemented");
            AddUnsupported(unsupported, type, "bbox-not-implemented");
            return null;
        }
        catch (Exception exception)
        {
            string reason = $"bbox-error:{exception.GetType().Name}";
            warnings.Add(reason);
            AddUnsupported(unsupported, type, reason);
            return null;
        }
    }

    private static void AddUnsupported(
        IDictionary<(string Type, string Reason), int> unsupported,
        string type,
        string reason)
    {
        var key = (type, reason);
        unsupported[key] = unsupported.TryGetValue(key, out int count)
            ? count + 1
            : 1;
    }

    private static string CreateDrawingId(string path)
    {
        using FileStream stream = File.OpenRead(path);
        string hash = Convert.ToHexString(SHA256.HashData(stream));
        return $"dwg:{hash[..24].ToLowerInvariant()}";
    }
}
