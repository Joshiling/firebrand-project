/// <summary>Represents a company returned by a search.</summary>
public sealed record Company
{
    public required string Name { get; init; }

    public required string RegistryId { get; init; }
}