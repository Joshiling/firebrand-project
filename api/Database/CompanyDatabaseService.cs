using System.Globalization;
using Api.Models;
using Microsoft.Data.Sqlite;

namespace Api.Database;

public sealed class CompanyDatabaseService(
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<CompanyDatabaseService> logger) : ICompanyDatabaseService
{
    private string? _resolvedConnectionString;

    public async Task<SearchLogPage> GetSearchLogsAsync(
        int page,
        int pageSize,
        string? query = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(page, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(pageSize, 1);

        await using var connection = new SqliteConnection(GetResolvedConnectionString());
        await connection.OpenAsync(cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);

        var normalizedQuery = string.IsNullOrWhiteSpace(query) ? null : query.Trim();
        var queryPattern = normalizedQuery is null ? null : $"%{EscapeLikePattern(normalizedQuery)}%";

        await using var countCommand = connection.CreateCommand();
        countCommand.CommandText = """
            SELECT COUNT(*)
            FROM search_logs AS log
            WHERE @Query IS NULL
                OR log.UserInput LIKE @Query ESCAPE '\'
                OR EXISTS (
                    SELECT 1
                    FROM search_log_companies AS link
                    INNER JOIN Companies AS company ON company.CompanyNumber = link.CompanyNumber
                    WHERE link.SearchLogId = log.SearchLogId
                        AND (
                            company.CompanyName LIKE @Query ESCAPE '\'
                            OR company.CompanyNumber LIKE @Query ESCAPE '\'
                        )
                );
            """;
        countCommand.Parameters.AddWithValue("@Query", (object?)queryPattern ?? DBNull.Value);
        var totalResults = Convert.ToInt32(await countCommand.ExecuteScalarAsync(cancellationToken));

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT
                log.SearchLogId,
                log.UserInput,
                (
                    SELECT CASE WHEN COUNT(*) = 1 THEN MAX(company.CompanyName) END
                    FROM search_log_companies AS link
                    INNER JOIN Companies AS company ON company.CompanyNumber = link.CompanyNumber
                    WHERE link.SearchLogId = log.SearchLogId
                ) AS CompanyName,
                log.SearchedAt,
                log.ResultCount,
                log.HttpStatus
            FROM search_logs AS log
            WHERE @Query IS NULL
                OR log.UserInput LIKE @Query ESCAPE '\'
                OR EXISTS (
                    SELECT 1
                    FROM search_log_companies AS link
                    INNER JOIN Companies AS company ON company.CompanyNumber = link.CompanyNumber
                    WHERE link.SearchLogId = log.SearchLogId
                        AND (
                            company.CompanyName LIKE @Query ESCAPE '\'
                            OR company.CompanyNumber LIKE @Query ESCAPE '\'
                        )
                )
            ORDER BY datetime(log.SearchedAt) DESC, log.SearchLogId DESC
            LIMIT @PageSize OFFSET @Offset;
            """;
        command.Parameters.AddWithValue("@Query", (object?)queryPattern ?? DBNull.Value);
        command.Parameters.AddWithValue("@PageSize", pageSize);
        command.Parameters.AddWithValue("@Offset", (page - 1) * pageSize);

        var items = new List<SearchLogEntry>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var searchedAt = DateTimeOffset.Parse(
                reader.GetString(3),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);

            items.Add(new SearchLogEntry(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                searchedAt,
                reader.IsDBNull(4) ? 0 : reader.GetInt32(4),
                reader.IsDBNull(5) ? 0 : reader.GetInt32(5)));
        }

        return new SearchLogPage(items, totalResults, page, pageSize, normalizedQuery);
    }

    private static string EscapeLikePattern(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    public async Task<long> SaveSearchLogAsync(
        string userInput,
        int httpStatus,
        int resultCount,
        string? apiResponse,
        IReadOnlyCollection<CompanyDbRecord> companies,
        CancellationToken cancellationToken = default)
    {
        var connectionString = GetResolvedConnectionString();
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        // Enforce SQLite foreign keys
        await using (var pragmaCmd = connection.CreateCommand())
        {
            pragmaCmd.CommandText = "PRAGMA foreign_keys = ON;";
            await pragmaCmd.ExecuteNonQueryAsync(cancellationToken);
        }

        await EnsureSchemaAsync(connection, cancellationToken);

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            // 1. Insert search_logs row and immediately capture the generated SearchLogId
            const string insertSearchLogSql = """
                INSERT INTO search_logs (UserInput, SearchedAt, ApiResponse, ResultCount, HttpStatus)
                VALUES (@UserInput, datetime('now'), @ApiResponse, @ResultCount, @HttpStatus);
                SELECT last_insert_rowid();
                """;

            long searchLogId;
            await using (var logCmd = connection.CreateCommand())
            {
                logCmd.Transaction = transaction;
                logCmd.CommandText = insertSearchLogSql;
                logCmd.Parameters.AddWithValue("@UserInput", userInput);
                logCmd.Parameters.AddWithValue("@ApiResponse", (object?)apiResponse ?? DBNull.Value);
                logCmd.Parameters.AddWithValue("@ResultCount", resultCount);
                logCmd.Parameters.AddWithValue("@HttpStatus", httpStatus);

                var scalarResult = await logCmd.ExecuteScalarAsync(cancellationToken);
                searchLogId = Convert.ToInt64(scalarResult);
            }

            // 2. If there are companies returned, upsert into Companies and insert links into search_log_companies
            if (companies.Count > 0)
            {
                const string upsertCompanySql = """
                    INSERT INTO Companies (
                        CompanyNumber,
                        CompanyName,
                        CompanyStatus,
                        IncorporationDate,
                        Address,
                        ExternalRegistrationNumber
                    ) VALUES (
                        @CompanyNumber,
                        @CompanyName,
                        @CompanyStatus,
                        @IncorporationDate,
                        @Address,
                        @ExternalRegistrationNumber
                    )
                    ON CONFLICT(CompanyNumber) DO UPDATE SET
                        CompanyName = excluded.CompanyName,
                        CompanyStatus = excluded.CompanyStatus,
                        IncorporationDate = excluded.IncorporationDate,
                        Address = excluded.Address,
                        ExternalRegistrationNumber = coalesce(excluded.ExternalRegistrationNumber, Companies.ExternalRegistrationNumber);
                    """;

                const string insertLinkSql = """
                    INSERT OR IGNORE INTO search_log_companies (SearchLogId, CompanyNumber)
                    VALUES (@SearchLogId, @CompanyNumber);
                    """;

                await using var companyCmd = connection.CreateCommand();
                companyCmd.Transaction = transaction;
                companyCmd.CommandText = upsertCompanySql;

                var pCompanyNumber = companyCmd.Parameters.Add("@CompanyNumber", SqliteType.Text);
                var pCompanyName = companyCmd.Parameters.Add("@CompanyName", SqliteType.Text);
                var pCompanyStatus = companyCmd.Parameters.Add("@CompanyStatus", SqliteType.Text);
                var pIncorporationDate = companyCmd.Parameters.Add("@IncorporationDate", SqliteType.Text);
                var pAddress = companyCmd.Parameters.Add("@Address", SqliteType.Text);
                var pExternalRegNumber = companyCmd.Parameters.Add("@ExternalRegistrationNumber", SqliteType.Text);

                await using var linkCmd = connection.CreateCommand();
                linkCmd.Transaction = transaction;
                linkCmd.CommandText = insertLinkSql;

                var pLinkLogId = linkCmd.Parameters.AddWithValue("@SearchLogId", searchLogId);
                var pLinkCompanyNumber = linkCmd.Parameters.Add("@CompanyNumber", SqliteType.Text);

                foreach (var company in companies)
                {
                    pCompanyNumber.Value = company.CompanyNumber;
                    pCompanyName.Value = company.CompanyName;
                    pCompanyStatus.Value = (object?)company.CompanyStatus ?? DBNull.Value;
                    pIncorporationDate.Value = (object?)company.IncorporationDate ?? DBNull.Value;
                    pAddress.Value = (object?)company.Address ?? DBNull.Value;
                    pExternalRegNumber.Value = (object?)company.ExternalRegistrationNumber ?? DBNull.Value;

                    await companyCmd.ExecuteNonQueryAsync(cancellationToken);

                    pLinkCompanyNumber.Value = company.CompanyNumber;
                    await linkCmd.ExecuteNonQueryAsync(cancellationToken);
                }
            }

            await transaction.CommitAsync(cancellationToken);
            logger.LogInformation("Saved search log {SearchLogId} for user input '{UserInput}' with {CompanyCount} companies.",
                searchLogId, userInput, companies.Count);

            return searchLogId;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogError(ex, "Failed to save search log for user input '{UserInput}' into database.", userInput);
            throw;
        }
    }

    private static async Task EnsureSchemaAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        const string schemaSql = """
            CREATE TABLE IF NOT EXISTS search_logs (
                SearchLogId INTEGER PRIMARY KEY,
                UserInput TEXT NOT NULL,
                SearchedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ApiResponse TEXT,
                ResultCount INTEGER,
                HttpStatus INTEGER
            );

            CREATE TABLE IF NOT EXISTS Companies (
                CompanyNumber TEXT PRIMARY KEY,
                CompanyName TEXT NOT NULL,
                CompanyStatus TEXT,
                IncorporationDate TEXT,
                Address TEXT,
                ExternalRegistrationNumber TEXT
            );

            CREATE TABLE IF NOT EXISTS search_log_companies (
                SearchLogId INTEGER NOT NULL,
                CompanyNumber TEXT NOT NULL,
                PRIMARY KEY (SearchLogId, CompanyNumber),
                FOREIGN KEY (SearchLogId) REFERENCES search_logs(SearchLogId),
                FOREIGN KEY (CompanyNumber) REFERENCES Companies(CompanyNumber)
            );
            """;

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = schemaSql;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private string GetResolvedConnectionString()
    {
        if (_resolvedConnectionString != null)
        {
            return _resolvedConnectionString;
        }

        var rawConnectionString = configuration.GetConnectionString("CompanyDatabase") ?? "Data Source=../database.db";
        var builder = new SqliteConnectionStringBuilder(rawConnectionString);
        var dataSource = builder.DataSource;

        if (!Path.IsPathRooted(dataSource))
        {
            var candidates = new[]
            {
                Path.Combine(Directory.GetCurrentDirectory(), dataSource),
                Path.Combine(environment.ContentRootPath, dataSource),
                Path.Combine(environment.ContentRootPath, "..", "database.db"),
                Path.Combine(Directory.GetCurrentDirectory(), "database.db"),
                Path.Combine(AppContext.BaseDirectory, dataSource),
                dataSource
            };

            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    builder.DataSource = Path.GetFullPath(candidate);
                    break;
                }
            }
        }

        _resolvedConnectionString = builder.ToString();
        return _resolvedConnectionString;
    }
}
