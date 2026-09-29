using Api.DTOs.CompaniesHouse;

/// <summary>Represents the full company profile returned by the API.</summary>
public sealed record Company
{
    public required string Name { get; init; }

    public required string RegistryId { get; init; }

    public string CompanyNumber => RegistryId;

    public string? Address { get; init; }

    public string? CompanyStatus { get; init; }

    public string? CompanyType { get; init; }

    public DateOnly? DateOfCreation { get; init; }

    public RegisteredOfficeAddressDto? RegisteredOfficeAddress { get; init; }
}