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
    internal const string OwnerMarkerName =
        ".dwg-version-probe-owner";
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
        string ownerToken = Convert.ToHexString(
            RandomNumberGenerator.GetBytes(32));
        var candidateHandles = new List<FileStream>();
        var results = new List<DwgVersionProbeResult>();
        try
        {
            WriteMarker(tempRoot, OwnerMarkerName, ownerToken);
            foreach (
                string candidate in DwgVersionPolicy.CandidateVersions)
            {
                results.Add(ProbeCandidate(
                    source,
                    sourceSha256,
                    sourceInvariant,
                    candidate,
                    tempRoot,
                    candidateHandles));
            }
            if (Sha256File(source) != sourceSha256)
            {
                throw new CadIoException("DWG_PROBE_SOURCE_CHANGED");
            }
        }
        finally
        {
            CleanupCandidateRoot(
                tempRoot,
                ownerToken,
                candidateHandles);
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

    internal static void CleanupCandidateRoot(
        string originalPath,
        string ownerToken,
        ICollection<FileStream> candidateHandles)
    {
        NeutralizeAndClose(candidateHandles);
        string quarantinePath = Path.Combine(
            Path.GetDirectoryName(originalPath)
                ?? Path.GetTempPath(),
            $"dwg-version-probe-quarantine-{Guid.NewGuid():N}");
        try
        {
            Directory.Move(originalPath, quarantinePath);
        }
        catch (Exception exception)
        {
            throw CleanupFailed(exception);
        }

        if (!MarkerMatches(quarantinePath, ownerToken))
        {
            TryRestoreUnrelatedReplacement(
                quarantinePath,
                originalPath);
            throw CleanupFailed();
        }

        try
        {
            Directory.Delete(quarantinePath, recursive: true);
        }
        catch (Exception exception)
        {
            throw CleanupFailed(exception);
        }
    }

    private static void WriteMarker(
        string root,
        string name,
        string token)
    {
        File.WriteAllText(
            Path.Combine(root, name),
            token,
            new UTF8Encoding(false));
    }

    private static bool MarkerMatches(
        string root,
        string expectedToken)
    {
        string path = Path.Combine(root, OwnerMarkerName);
        try
        {
            if (
                File.GetAttributes(path)
                    .HasFlag(FileAttributes.ReparsePoint))
            {
                return false;
            }
            byte[] actual = File.ReadAllBytes(path);
            byte[] expected = Encoding.UTF8.GetBytes(expectedToken);
            return actual.Length == expected.Length
                && CryptographicOperations.FixedTimeEquals(
                    actual,
                    expected);
        }
        catch
        {
            return false;
        }
    }

    private static void TryRestoreUnrelatedReplacement(
        string quarantinePath,
        string originalPath)
    {
        try
        {
            if (
                !Directory.Exists(originalPath)
                && !File.Exists(originalPath))
            {
                Directory.Move(quarantinePath, originalPath);
            }
        }
        catch
        {
            // The unowned replacement remains untouched in quarantine.
        }
    }

    private static void NeutralizeAndClose(
        ICollection<FileStream> candidateHandles)
    {
        foreach (FileStream handle in candidateHandles)
        {
            try
            {
                handle.Position = 0;
                handle.SetLength(0);
                handle.Flush(flushToDisk: true);
            }
            catch
            {
                // Continue neutralizing every owned candidate handle.
            }
            finally
            {
                try
                {
                    handle.Dispose();
                }
                catch
                {
                    // Continue closing every owned candidate handle.
                }
            }
        }
        candidateHandles.Clear();
    }

    private static CadIoException CleanupFailed(
        Exception? exception = null)
    {
        return exception is null
            ? new CadIoException("DWG_PROBE_CLEANUP_FAILED")
            : new CadIoException(
                "DWG_PROBE_CLEANUP_FAILED",
                exception);
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
        string tempRoot,
        ICollection<FileStream> candidateHandles)
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
        finally
        {
            CaptureCandidateHandle(
                candidatePath,
                candidateHandles);
        }
        return new DwgVersionProbeResult(
            candidate,
            sourceSha256,
            sourceInvariant,
            observedInvariant,
            verified,
            BoundWarnings(warnings));
    }

    private static void CaptureCandidateHandle(
        string path,
        ICollection<FileStream> candidateHandles)
    {
        try
        {
            candidateHandles.Add(new FileStream(
                path,
                FileMode.Open,
                FileAccess.ReadWrite,
                FileShare.ReadWrite | FileShare.Delete));
        }
        catch (FileNotFoundException)
        {
            // A writer failure may leave no candidate inode.
        }
        catch (DirectoryNotFoundException)
        {
            // A writer failure may leave no candidate inode.
        }
        catch (Exception exception)
        {
            throw CleanupFailed(exception);
        }
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
