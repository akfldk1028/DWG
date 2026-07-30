using System.Text;
using System.Text.Json;
using DwgIntelligence.CadIo;

const string genericDiagnostic = "CAD I/O request failed.";
var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
};

try
{
    string requestJson = ReadSingleRequest();
    CadIoRequest request = CadIoRequest.Parse(requestJson);
    string? manifest = ParseManifestArgument(args);
    if (request.Format == "dwg" && manifest is null)
    {
        throw new CadIoException("DWG_POLICY_NOT_CONFIGURED");
    }
    CadIoSuccessResponse response = CadFileWriter.Write(
        request,
        dwgPolicyConfigured: manifest is not null);
    WriteBoundedJson(response);
    return 0;
}
catch (CadIoException exception)
{
    WriteBoundedJson(CadIoErrorResponse.Create(exception.Code));
    Console.Error.WriteLine(genericDiagnostic);
    return 1;
}
catch
{
    WriteBoundedJson(CadIoErrorResponse.Create("CAD_IO_FAILED"));
    Console.Error.WriteLine(genericDiagnostic);
    return 1;
}

string ReadSingleRequest()
{
    Stream input = Console.OpenStandardInput();
    using var buffer = new MemoryStream();
    byte[] chunk = new byte[16_384];
    while (true)
    {
        int read = input.Read(chunk, 0, chunk.Length);
        if (read == 0)
        {
            break;
        }
        if (buffer.Length + read > CadIoRequest.MaxJsonBytes)
        {
            throw new CadIoException("CAD_REQUEST_LIMIT");
        }
        buffer.Write(chunk, 0, read);
    }
    try
    {
        return new UTF8Encoding(false, true).GetString(buffer.ToArray());
    }
    catch (DecoderFallbackException exception)
    {
        throw new CadIoException("CAD_REQUEST_INVALID", exception);
    }
}

string? ParseManifestArgument(string[] arguments)
{
    if (arguments.Length == 0)
    {
        return null;
    }
    if (
        arguments.Length != 2
        || arguments[0] != "--dwg-policy-manifest"
        || !Path.IsPathFullyQualified(arguments[1]))
    {
        throw new CadIoException("CAD_REQUEST_INVALID");
    }
    return arguments[1];
}

void WriteBoundedJson<T>(T response)
{
    string json = JsonSerializer.Serialize(response, jsonOptions);
    if (Encoding.UTF8.GetByteCount(json) > CadIoRequest.MaxJsonBytes)
    {
        throw new CadIoException("CAD_RESPONSE_LIMIT");
    }
    Console.Out.WriteLine(json);
}
