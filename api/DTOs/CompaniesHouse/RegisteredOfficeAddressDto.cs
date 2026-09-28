using System.Text.Json.Serialization;

namespace Api.DTOs.CompaniesHouse;

// Represents the registered office address data included in a Companies House
// company profile response, mapped from the API's JSON field names.
public class RegisteredOfficeAddressDto
{
    [JsonPropertyName("address_line_1")]
    public string? AddressLine1 { get; set; }

    [JsonPropertyName("address_line_2")]
    public string? AddressLine2 { get; set; }

    [JsonPropertyName("locality")]
    public string? Locality { get; set; }

    [JsonPropertyName("region")]
    public string? Region { get; set; }

    [JsonPropertyName("postal_code")]
    public string? PostalCode { get; set; }

    [JsonPropertyName("country")]
    public string? Country { get; set; }
}