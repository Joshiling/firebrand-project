namespace Api.Database;

/// <summary>
/// Data transfer record for writing company details into the Companies table in database.db.
/// </summary>
public sealed record CompanyDbRecord
{
    public required string CompanyNumber { get; init; }

    public required string CompanyName { get; init; }

    public string? CompanyStatus { get; init; }

    public string? IncorporationDate { get; init; }

    public string? Address { get; init; }

    public string? ExternalRegistrationNumber { get; init; }
}
