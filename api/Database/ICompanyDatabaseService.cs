using Api.Models;

namespace Api.Database;

public interface ICompanyDatabaseService
{
    /// <summary>Reads recorded searches in reverse chronological order.</summary>
    Task<SearchLogPage> GetSearchLogsAsync(
        int page,
        int pageSize,
        string? query = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Writes search and lookup events along with returned company records into database.db.
    /// Handles writing to search_logs, Companies (upsert), and search_log_companies within a transaction.
    /// </summary>
    Task<long> SaveSearchLogAsync(
        string userInput,
        int httpStatus,
        int resultCount,
        string? apiResponse,
        IReadOnlyCollection<CompanyDbRecord> companies,
        CancellationToken cancellationToken = default);

    Task<CompanyVersionResult> SaveCompanyProfileWithVersionAsync(
        string registryId,
        int httpStatus,
        string? rawJson,
        CompanyDbRecord companyRecord,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CompanyHistoryRecord>> GetCompanyHistoryAsync(
        string companyNumber,
        CancellationToken cancellationToken = default);
}
