using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Xunit;

namespace DwgIntelligence.CadIo.Tests;

public sealed class DwgRoundTripTests
{
    private static readonly string[] ExpectedCandidates =
        ["AC1014", "AC1015", "AC1018", "AC1024", "AC1027", "AC1032"];

    [Fact]
    public void PolicyLoadsOnlyACompleteImmutableVerifiedAllowlist()
    {
        using var fixture = PolicyFixture.Create(
            verifiedVersion: "AC1032");

        DwgVersionPolicy policy = DwgVersionPolicy.Load(
            fixture.ManifestPath);
        File.WriteAllText(
            fixture.ManifestPath,
            ManifestJson(verifiedVersion: "AC1014"));

        Assert.Equal(
            ExpectedCandidates,
            DwgVersionPolicy.CandidateVersions);
        Assert.Equal(ExpectedCandidates, policy.Entries.Select(
            entry => entry.Version));
        Assert.True(policy.IsAllowed("AC1032"));
        Assert.False(policy.IsAllowed("AC1014"));
        Assert.False(policy.IsAllowed("AC9999"));
        Assert.Throws<NotSupportedException>(
            () => ((IList<DwgVersionEvidence>)policy.Entries).Add(
                new DwgVersionEvidence(
                    "AC9999",
                    "A".Repeat(64),
                    true,
                    "B".Repeat(64))));
    }

    [Theory]
    [MemberData(nameof(InvalidManifestJson))]
    public void PolicyRejectsIncompleteUnknownDuplicateOrMalformedEvidence(
        string json)
    {
        using var fixture = PolicyFixture.Create(json: json);

        CadIoException error = Assert.Throws<CadIoException>(
            () => DwgVersionPolicy.Load(fixture.ManifestPath));

        Assert.Equal("DWG_POLICY_INVALID", error.Code);
    }

    [Fact]
    public void WriterRejectsAnUnverifiedDwgVersionBeforeTouchingOutput()
    {
        using var fixture = PolicyFixture.Create(
            verifiedVersion: "AC1032");
        DwgVersionPolicy policy = DwgVersionPolicy.Load(
            fixture.ManifestPath);
        string missingSource = Path.Combine(fixture.Root, "missing.dwg");
        string output = Path.Combine(fixture.Root, "must-not-exist.dwg");
        CadIoRequest request = CadIoRequest.Parse(JsonSerializer.Serialize(
            new
            {
                schemaVersion = "cad-io/v1",
                operation = "write-copy",
                sourcePath = missingSource,
                temporaryOutputPath = output,
                format = "dwg",
                version = "AC1027",
                lineage = Array.Empty<object>()
            }));

        CadIoException error = Assert.Throws<CadIoException>(
            () => CadFileWriter.Write(request, policy));

        Assert.Equal("DWG_VERSION_NOT_ALLOWLISTED", error.Code);
        Assert.False(File.Exists(output));
    }

    [Fact]
    public void CheckedInPolicyIsCompleteReleaseReadyAndMatchesProbeFixture()
    {
        string root = RepositoryRoot();
        string manifestPath = Path.Combine(
            root,
            "tests",
            "fixtures",
            "dwg",
            "roundtrip-manifest.json");
        string sourcePath = Path.Combine(
            root,
            "tests",
            "fixtures",
            "dwg",
            "export_sample.dwg");

        DwgVersionPolicy policy = DwgVersionPolicy.Load(manifestPath);
        string sourceHash = Convert.ToHexString(
            SHA256.HashData(File.ReadAllBytes(sourcePath)));
        string invariantHash = DwgRoundTripInvariant.ComputeSha256(
            DwgIndexBuilder.Build(sourcePath));
        DwgVersionEvidence[] verified = policy.Entries
            .Where(entry => entry.Verified)
            .ToArray();

        Assert.NotEmpty(verified);
        Assert.All(
            verified,
            entry =>
            {
                Assert.Equal(sourceHash, entry.ProbeFixtureSha256);
                Assert.Equal(invariantHash, entry.InvariantSha256);
            });
    }

    [Fact]
    public void VerifiedFixtureVersionsWriteReopenAndPreserveInvariant()
    {
        string root = RepositoryRoot();
        string manifestPath = Path.Combine(
            root,
            "tests",
            "fixtures",
            "dwg",
            "roundtrip-manifest.json");
        string sourcePath = Path.Combine(
            root,
            "tests",
            "fixtures",
            "dwg",
            "export_sample.dwg");
        string sourceHash = Sha256(sourcePath);
        DwgVersionPolicy policy = DwgVersionPolicy.Load(manifestPath);
        CadIndex sourceIndex = DwgIndexBuilder.Build(sourcePath);
        string sourceInvariant =
            DwgRoundTripInvariant.ComputeSha256(sourceIndex);
        string outputRoot = Path.Combine(
            Path.GetTempPath(),
            $"dwg-roundtrip-{Guid.NewGuid():N}");
        Directory.CreateDirectory(outputRoot);
        try
        {
            foreach (
                DwgVersionEvidence entry
                in policy.Entries.Where(entry => entry.Verified))
            {
                string outputPath = Path.Combine(
                    outputRoot,
                    $"{entry.Version}.dwg");
                CadIoRequest request = CadIoRequest.Parse(
                    JsonSerializer.Serialize(new
                    {
                        schemaVersion = "cad-io/v1",
                        operation = "write-copy",
                        sourcePath,
                        temporaryOutputPath = outputPath,
                        format = "dwg",
                        version = entry.Version,
                        lineage = Array.Empty<object>()
                    }));

                CadIoSuccessResponse response = CadFileWriter.Write(
                    request,
                    policy);
                CadIndex reopened = DwgIndexBuilder.Build(outputPath);

                Assert.Equal(entry.Version, response.Version);
                Assert.Equal(
                    entry.Version,
                    reopened.Drawing.FileVersion);
                Assert.Equal(
                    sourceInvariant,
                    DwgRoundTripInvariant.ComputeSha256(reopened));
                Assert.Equal(sourceHash, Sha256(sourcePath));
            }
        }
        finally
        {
            Directory.Delete(outputRoot, recursive: true);
        }
    }

    public static IEnumerable<object[]> InvalidManifestJson()
    {
        yield return [ManifestJson(verifiedVersion: null)];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            rootExtra: ",\"unknown\":true")];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            entryExtra: ",\"unknown\":true")];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            duplicateRootKey: true)];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            versions: [
                "AC1014",
                "AC1015",
                "AC1018",
                "AC1024",
                "AC1027",
                "AC1027"
            ])];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            versions: ExpectedCandidates[..^1])];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            versions: [
                "AC1014",
                "AC1015",
                "AC1018",
                "AC1024",
                "AC1027",
                "AC9999"
            ])];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            verifiedHash: "a".Repeat(64))];
        yield return [ManifestJson(
            verifiedVersion: "AC1032",
            unverifiedHash: "A".Repeat(64))];
    }

    private static string ManifestJson(
        string? verifiedVersion,
        IReadOnlyList<string>? versions = null,
        string verifiedHash = "",
        string unverifiedHash = "",
        string rootExtra = "",
        string entryExtra = "",
        bool duplicateRootKey = false)
    {
        versions ??= ExpectedCandidates;
        string fixtureHash = string.IsNullOrEmpty(verifiedHash)
            ? "A".Repeat(64)
            : verifiedHash;
        string entries = string.Join(
            ",",
            versions.Select(version =>
            {
                bool verified = version == verifiedVersion;
                string probeHash = verified
                    ? fixtureHash
                    : unverifiedHash;
                string invariantHash = verified
                    ? "B".Repeat(64)
                    : unverifiedHash;
                return $$"""
                {
                  "version":"{{version}}",
                  "probeFixtureSha256":"{{probeHash}}",
                  "verified":{{verified.ToString().ToLowerInvariant()}},
                  "invariantSha256":"{{invariantHash}}"{{entryExtra}}
                }
                """;
            }));
        string duplicate = duplicateRootKey
            ? ",\"schemaVersion\":\"dwg-roundtrip-policy/v1\""
            : "";
        return $$"""
        {
          "schemaVersion":"dwg-roundtrip-policy/v1"{{duplicate}},
          "candidates":[{{entries}}]{{rootExtra}}
        }
        """;
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (
            directory is not null
            && (!Directory.Exists(
                    Path.Combine(directory.FullName, "apps"))
                || !Directory.Exists(
                    Path.Combine(directory.FullName, "tests"))))
        {
            directory = directory.Parent;
        }
        return directory?.FullName
            ?? throw new InvalidOperationException(
                "Repository root was not found.");
    }

    private static string Sha256(string path)
    {
        using FileStream stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }

    private sealed class PolicyFixture : IDisposable
    {
        public required string Root { get; init; }
        public required string ManifestPath { get; init; }

        public static PolicyFixture Create(
            string? verifiedVersion = null,
            string? json = null)
        {
            string root = Path.Combine(
                Path.GetTempPath(),
                $"dwg-policy-{Guid.NewGuid():N}");
            Directory.CreateDirectory(root);
            string manifestPath = Path.Combine(root, "manifest.json");
            File.WriteAllText(
                manifestPath,
                json ?? ManifestJson(verifiedVersion),
                new UTF8Encoding(false));
            return new PolicyFixture
            {
                Root = root,
                ManifestPath = manifestPath
            };
        }

        public void Dispose()
        {
            Directory.Delete(Root, recursive: true);
        }
    }
}

internal static class StringTestExtensions
{
    public static string Repeat(this string value, int count)
    {
        return string.Concat(Enumerable.Repeat(value, count));
    }
}
