/// <summary>Represents a company shown in search results.</summary>
public sealed record CompanySearch
{
    public required string Name { get; init; }

    public required string RegistryId { get; init; }

    public string CompanyNumber => RegistryId;

    public string? Address { get; init; }
}