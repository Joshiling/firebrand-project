namespace Api.Database;

/// <summary>Represents one recorded company search.</summary>
public sealed record SearchLogEntry(
    long SearchLogId,
    string UserInput,
    string? CompanyName,
    DateTimeOffset SearchedAt,
    int ResultCount,
    int HttpStatus);

/// <summary>Represents one page of recorded company searches.</summary>
public sealed record SearchLogPage(
    IReadOnlyList<SearchLogEntry> Items,
    int TotalResults,
    int Page,
    int PageSize,
    string? Query);