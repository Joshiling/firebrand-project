namespace Api.Database;

public sealed record CompanyVersionResult
{
    public required long SearchLogId { get; init; }

    public required int CurrentVersion { get; init; }

    public required int TotalVersions { get; init; }

    public required bool HasChanged { get; init; }
}