using System.Text.Json.Serialization;

namespace Api.DTOs.CompaniesHouse;

// Represents the core company information returned by the Companies House API
// for a company profile response, including registration and status details.
public class CompanyProfileDto
{
    [JsonPropertyName("company_name")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("company_number")]
    public string? CompanyNumber { get; set; }

    [JsonPropertyName("company_status")]
    public string? CompanyStatus { get; set; }

    [JsonPropertyName("date_of_creation")]
    public DateOnly? DateOfCreation { get; set; }

    [JsonPropertyName("registered_office_address")]
    public RegisteredOfficeAddressDto? RegisteredOfficeAddress { get; set; }
}