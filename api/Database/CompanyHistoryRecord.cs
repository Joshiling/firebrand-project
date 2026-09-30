namespace Api.Database;

using System.Text.Json.Serialization;

public sealed record CompanyHistoryRecord
{
    [JsonPropertyName("version_number")]
    public required int VersionNumber { get; init; }

    [JsonPropertyName("recorded_at")]
    public required string RecordedAt { get; init; }

    [JsonPropertyName("company_number")]
    public required string CompanyNumber { get; init; }

    [JsonPropertyName("company_name")]
    public required string CompanyName { get; init; }

    [JsonPropertyName("company_status")]
    public string? CompanyStatus { get; init; }

    [JsonPropertyName("incorporation_date")]
    public string? IncorporationDate { get; init; }

    [JsonPropertyName("address")]
    public string? Address { get; init; }

    [JsonPropertyName("external_registration_number")]
    public string? ExternalRegistrationNumber { get; init; }
}