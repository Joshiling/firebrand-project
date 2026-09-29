public sealed record CompanySearchFilters
{
    public IReadOnlyList<string> CompanyStatuses { get; init; } = [];

    public IReadOnlyList<string> CompanyTypes { get; init; } = [];

    public string? Location { get; init; }

    public bool HasFilters => CompanyStatuses.Count > 0
        || CompanyTypes.Count > 0
        || !string.IsNullOrWhiteSpace(Location);
}