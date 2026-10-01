using System.Text.Json.Serialization;

namespace Api.DTOs.CompaniesHouse;

public sealed class AdvancedCompanySearchResponseDto
{
    [JsonPropertyName("items")]
    public List<AdvancedCompanySearchItemDto>? Items { get; set; }

    [JsonPropertyName("total_results")]
    public int? TotalResults { get; set; }
}

public sealed class AdvancedCompanySearchItemDto
{
    [JsonPropertyName("company_name")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("company_number")]
    public string? CompanyNumber { get; set; }

    [JsonPropertyName("company_status")]
    public string? CompanyStatus { get; set; }

    [JsonPropertyName("company_type")]
    public string? CompanyType { get; set; }

    [JsonPropertyName("date_of_creation")]
    public DateOnly? DateOfCreation { get; set; }

    [JsonPropertyName("address")]
    public RegisteredOfficeAddressDto? Address { get; set; }

    [JsonPropertyName("registered_office_address")]
    public RegisteredOfficeAddressDto? RegisteredOfficeAddress { get; set; }

    [JsonPropertyName("address_snippet")]
    public string? AddressSnippet { get; set; }
}