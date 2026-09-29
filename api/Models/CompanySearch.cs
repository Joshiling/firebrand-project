/// <summary>Represents a company shown in search results.</summary>

namespace Api.Models;

public sealed record CompanySearch
{
    public required string Name { get; init; }

    public required string RegistryId { get; init; }

    public string? Address { get; init; }

    public string? CompanyStatus { get; init; }

    public string? CompanyType { get; init; }
}