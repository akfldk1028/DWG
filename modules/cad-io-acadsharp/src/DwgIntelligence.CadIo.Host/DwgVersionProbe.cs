using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ACadSharp;
using ACadSharp.IO;
using DwgIntelligence.CadIo;

public static class DwgVersionProbe
{
    private const int MaxWarnings = 16;
    private const int MaxWarningCharacters = 120;
    private const int CleanupAttempts = 4;
    private const int CleanupRetryMilliseconds = 25;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public static void Run(string sourcePath, string outputPath)
    {
        string source = Path.GetFullPath(sourcePath);
        string output = Path.GetFullPath(outputPath);
        if (
            !File.Exists(source)
            || Path.GetExtension(source) != ".dwg"
            || string.Equals(
                source,
                output,
                StringComparison.OrdinalIgnoreCase))
        {
            throw new CadIoException("DWG_PROBE_INVALID");
        }
        string? outputDirectory = Path.GetDirectoryName(output);
        if (string.IsNullOrEmpty(outputDirectory))
        {
            throw new CadIoException("DWG_PROBE_INVALID");
        }
        Directory.CreateDirectory(outputDirectory);

        string sourceSha256 = Sha256File(source);
        CadIndex sourceIndex;
        string sourceInvariant;
        try
        {
            sourceIndex = DwgIndexBuilder.Build(source);
            sourceInvariant =
                DwgRoundTripInvariant.ComputeSha256(sourceIndex);
        }
        catch (Exception exception)
        {
            throw new CadIoException("DWG_PROBE_SOURCE_INVALID", exception);
        }

        string tempRoot = Path.Combine(
            Path.GetTempPath(),
            $"dwg-version-probe-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempRoot);
        var results = new List<DwgVersionProbeResult>();
        try
        {
            foreach (
                string candidate in DwgVersionPolicy.CandidateVersions)
            {
                results.Add(ProbeCandidate(
                    source,
                    sourceSha256,
                    sourceInvariant,
                    candidate,
                    tempRoot));
            }
            if (Sha256File(source) != sourceSha256)
            {
                throw new CadIoException("DWG_PROBE_SOURCE_CHANGED");
            }
        }
        finally
        {
            CleanupCandidateRoot(tempRoot);
        }

        var report = new DwgVersionProbeReport(
            "dwg-version-probe/v1",
            sourceSha256,
            sourceInvariant,
            results.AsReadOnly());
        string json = JsonSerializer.Serialize(report, JsonOptions);
        if (
            Encoding.UTF8.GetByteCount(json)
            > CadIoRequest.MaxJsonBytes)
        {
            throw new CadIoException("DWG_PROBE_RESULT_LIMIT");
        }

        string? temporaryOutput = null;
        try
        {
            temporaryOutput = Path.Combine(
                outputDirectory,
                $".{Path.GetFileName(output)}.{Guid.NewGuid():N}.tmp");
            File.WriteAllText(
                temporaryOutput,
                json + Environment.NewLine,
                new UTF8Encoding(false));
            File.Move(temporaryOutput, output);
        }
        finally
        {
            TryDeleteFile(temporaryOutput);
        }
    }

    private static void CleanupCandidateRoot(string path)
    {
        Exception? lastFailure = null;
        for (int attempt = 0; attempt < CleanupAttempts; attempt += 1)
        {
            try
            {
                Directory.Delete(path, recursive: true);
                return;
            }
            catch (DirectoryNotFoundException)
            {
                return;
            }
            catch (Exception exception)
                when (
                    exception is IOException
                    or UnauthorizedAccessException)
            {
                lastFailure = exception;
                if (attempt + 1 < CleanupAttempts)
                {
                    Thread.Sleep(
                        CleanupRetryMilliseconds * (attempt + 1));
                }
            }
            catch (Exception exception)
            {
                throw new CadIoException(
                    "DWG_PROBE_CLEANUP_FAILED",
                    exception);
            }
        }
        throw new CadIoException(
            "DWG_PROBE_CLEANUP_FAILED",
            lastFailure
                ?? new IOException("Candidate cleanup failed."));
    }

    private static void TryDeleteFile(string? path)
    {
        if (path is null)
        {
            return;
        }
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Never mask the bounded probe failure response.
        }
    }

    private static DwgVersionProbeResult ProbeCandidate(
        string source,
        string sourceSha256,
        string sourceInvariant,
        string candidate,
        string tempRoot)
    {
        var warnings = new List<string>();
        string observedInvariant = "";
        bool verified = false;
        string candidatePath = Path.Combine(
            tempRoot,
            $"{candidate}.dwg");
        try
        {
            if (!Enum.TryParse(candidate, out ACadVersion version))
            {
                warnings.Add("candidate-version-invalid");
            }
            else
            {
                CadDocument document = DwgReader.Read(source);
                document.Header.Version = version;
                document.UpdateDxfClasses(reset: false);
                DwgWriter.Write(candidatePath, document);
                CadIndex reopened = DwgIndexBuilder.Build(candidatePath);
                observedInvariant =
                    DwgRoundTripInvariant.ComputeSha256(reopened);
                if (reopened.Drawing.FileVersion != candidate)
                {
                    warnings.Add("reopened-version-mismatch");
                }
                if (observedInvariant != sourceInvariant)
                {
                    warnings.Add("roundtrip-invariant-mismatch");
                }
                verified = warnings.Count == 0;
            }
        }
        catch (Exception exception)
        {
            warnings.Add(
                $"candidate-failed:{exception.GetType().Name}");
        }
        return new DwgVersionProbeResult(
            candidate,
            sourceSha256,
            sourceInvariant,
            observedInvariant,
            verified,
            BoundWarnings(warnings));
    }

    private static IReadOnlyList<string> BoundWarnings(
        IEnumerable<string> warnings)
    {
        return Array.AsReadOnly(
            warnings
                .Take(MaxWarnings)
                .Select(warning => warning.Length <= MaxWarningCharacters
                    ? warning
                    : warning[..MaxWarningCharacters])
                .ToArray());
    }

    private static string Sha256File(string path)
    {
        using FileStream stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }
}

public sealed record DwgVersionProbeReport(
    string SchemaVersion,
    string ProbeFixtureSha256,
    string InvariantSha256,
    IReadOnlyList<DwgVersionProbeResult> Candidates);

public sealed record DwgVersionProbeResult(
    string Version,
    string ProbeFixtureSha256,
    string InvariantSha256,
    string ObservedInvariantSha256,
    bool Verified,
    IReadOnlyList<string> Warnings);
