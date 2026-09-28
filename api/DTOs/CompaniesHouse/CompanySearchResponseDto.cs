using System.Text.Json.Serialization;

namespace Api.DTOs.CompaniesHouse;

public sealed class CompanySearchResponseDto
{
    [JsonPropertyName("items")]
    public List<CompanySearchItemDto>? Items { get; set; }

    [JsonPropertyName("total_results")]
    public int? TotalResults { get; set; }
}

public sealed class CompanySearchItemDto
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("company_number")]
    public string? CompanyNumber { get; set; }

    [JsonPropertyName("address_snippet")]
    public string? AddressSnippet { get; set; }
}