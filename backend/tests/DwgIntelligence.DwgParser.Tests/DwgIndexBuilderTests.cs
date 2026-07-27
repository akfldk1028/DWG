using System.Security.Cryptography;
using Xunit;

namespace DwgIntelligence.DwgParser.Tests;

public sealed class DwgIndexBuilderTests
{
    [Fact]
    public void BuildsNormalizedIndexFromRealDwgWithoutChangingSource()
    {
        string path = Path.Combine(
            AppContext.BaseDirectory,
            "Fixtures",
            "export_sample.dwg");
        string before = Sha256(path);

        CadIndex index = DwgIndexBuilder.Build(path);

        string after = Sha256(path);
        Assert.Equal("cad-index/v0.1", index.SchemaVersion);
        Assert.Equal("dwg", index.Source.Kind);
        Assert.Equal("acadsharp@3.6.35", index.Source.Parser);
        Assert.NotEmpty(index.Entities);
        Assert.Contains(
            index.Entities,
            entity => entity.Handle is not null && entity.Id == $"h:{entity.Handle}");
        Assert.Equal(before, after);
    }

    private static string Sha256(string path)
    {
        using FileStream stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }
}
