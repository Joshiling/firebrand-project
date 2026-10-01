using System.Globalization;
using Api.Models;
using Microsoft.Data.Sqlite;
using System.Security.Cryptography;
using System.Text;

namespace Api.Database;

public sealed class CompanyDatabaseService(
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<CompanyDatabaseService> logger) : ICompanyDatabaseService
{
    private string? _resolvedConnectionString;

    private const string VersionHistoryMigration = "company-version-history-v1";

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
        // Parameters prevent SQL injection; escaping separately makes LIKE metacharacters literal.
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

        // Keep raw upstream payloads out of this projection. IDs break timestamp ties between pages.
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
        // Promote before multiplying: a valid Int32 page can exceed an Int32 row offset.
        command.Parameters.AddWithValue("@Offset", ((long)page - 1) * pageSize);

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

    public async Task<CompanyVersionResult> SaveCompanyProfileWithVersionAsync(
        string registryId,
        int httpStatus,
        string? rawJson,
        CompanyDbRecord companyRecord,
        CancellationToken cancellationToken = default)
    {
        var connectionString = GetResolvedConnectionString();
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await EnableForeignKeysAsync(connection, cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);

        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var searchLogId = await InsertSearchLogAsync(
                connection,
                transaction,
                registryId,
                httpStatus,
                1,
                rawJson,
                cancellationToken);

            var contentHash = ComputeContentHash(companyRecord);
            var currentVersion = 0;
            string? storedHash = null;

            await using (var currentCmd = connection.CreateCommand())
            {
                currentCmd.Transaction = transaction;
                currentCmd.CommandText = "SELECT CurrentVersion, ContentHash FROM Companies WHERE CompanyNumber = @CompanyNumber;";
                currentCmd.Parameters.AddWithValue("@CompanyNumber", companyRecord.CompanyNumber);
                await using var reader = await currentCmd.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken))
                {
                    currentVersion = reader.GetInt32(0);
                    storedHash = reader.IsDBNull(1) ? null : reader.GetString(1);
                }
            }

            var hasChanged = currentVersion == 0
                || storedHash is null
                || !string.Equals(storedHash, contentHash, StringComparison.Ordinal);
            if (currentVersion == 0 || storedHash is null)
            {
                currentVersion = 1;
            }
            else if (hasChanged)
            {
                currentVersion++;
            }

            await UpsertVersionedCompanyAsync(
                connection,
                transaction,
                companyRecord,
                contentHash,
                currentVersion,
                cancellationToken);

            if (hasChanged)
            {
                await InsertHistoryAsync(
                    connection,
                    transaction,
                    companyRecord,
                    contentHash,
                    currentVersion,
                    searchLogId,
                    cancellationToken);
            }

            await using (var linkCmd = connection.CreateCommand())
            {
                linkCmd.Transaction = transaction;
                linkCmd.CommandText = "INSERT OR IGNORE INTO search_log_companies (SearchLogId, CompanyNumber) VALUES (@SearchLogId, @CompanyNumber);";
                linkCmd.Parameters.AddWithValue("@SearchLogId", searchLogId);
                linkCmd.Parameters.AddWithValue("@CompanyNumber", companyRecord.CompanyNumber);
                await linkCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            int totalVersions;
            await using (var countCmd = connection.CreateCommand())
            {
                countCmd.Transaction = transaction;
                countCmd.CommandText = "SELECT COUNT(*) FROM CompanyHistory WHERE CompanyNumber = @CompanyNumber;";
                countCmd.Parameters.AddWithValue("@CompanyNumber", companyRecord.CompanyNumber);
                totalVersions = Convert.ToInt32(await countCmd.ExecuteScalarAsync(cancellationToken));
            }

            await transaction.CommitAsync(cancellationToken);
            return new CompanyVersionResult
            {
                SearchLogId = searchLogId,
                CurrentVersion = currentVersion,
                TotalVersions = totalVersions,
                HasChanged = hasChanged
            };
        }
        catch (Exception exception)
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogError(exception, "Failed to save versioned company profile for '{RegistryId}'.", registryId);
            throw;
        }
    }

    public async Task<IReadOnlyList<CompanyHistoryRecord>> GetCompanyHistoryAsync(
        string companyNumber,
        CancellationToken cancellationToken = default)
    {
        var connectionString = GetResolvedConnectionString();
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await EnableForeignKeysAsync(connection, cancellationToken);
        await EnsureSchemaAsync(connection, cancellationToken);

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT VersionNumber, RecordedAt, CompanyNumber, CompanyName, CompanyStatus,
                   IncorporationDate, Address, ExternalRegistrationNumber
            FROM CompanyHistory
            WHERE CompanyNumber = @CompanyNumber
            ORDER BY VersionNumber DESC;
            """;
        cmd.Parameters.AddWithValue("@CompanyNumber", companyNumber);

        var history = new List<CompanyHistoryRecord>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            history.Add(new CompanyHistoryRecord
            {
                VersionNumber = reader.GetInt32(0),
                RecordedAt = reader.GetString(1),
                CompanyNumber = reader.GetString(2),
                CompanyName = reader.GetString(3),
                CompanyStatus = reader.IsDBNull(4) ? null : reader.GetString(4),
                IncorporationDate = reader.IsDBNull(5) ? null : reader.GetString(5),
                Address = reader.IsDBNull(6) ? null : reader.GetString(6),
                ExternalRegistrationNumber = reader.IsDBNull(7) ? null : reader.GetString(7)
            });
        }

        return history;
    }

    private static async Task EnsureSchemaAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        const string schemaSql = """
            CREATE TABLE IF NOT EXISTS SchemaMigrations (
                MigrationId TEXT PRIMARY KEY,
                AppliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

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
                ExternalRegistrationNumber TEXT,
                CurrentVersion INTEGER NOT NULL DEFAULT 1,
                ContentHash TEXT,
                LastSeenAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

        await AddColumnIfMissingAsync(connection, "Companies", "CurrentVersion", "INTEGER NOT NULL DEFAULT 1", cancellationToken);
        await AddColumnIfMissingAsync(connection, "Companies", "ContentHash", "TEXT", cancellationToken);
        await AddColumnIfMissingAsync(connection, "Companies", "LastSeenAt", "TEXT", cancellationToken);

        cmd.CommandText = """
            UPDATE Companies SET LastSeenAt = CURRENT_TIMESTAMP WHERE LastSeenAt IS NULL;

            CREATE TABLE IF NOT EXISTS CompanyHistory (
                HistoryId INTEGER PRIMARY KEY AUTOINCREMENT,
                CompanyNumber TEXT NOT NULL,
                VersionNumber INTEGER NOT NULL,
                CompanyName TEXT NOT NULL,
                CompanyStatus TEXT,
                IncorporationDate TEXT,
                Address TEXT,
                ExternalRegistrationNumber TEXT,
                ContentHash TEXT NOT NULL,
                RecordedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                SearchLogId INTEGER,
                FOREIGN KEY (CompanyNumber) REFERENCES Companies(CompanyNumber) ON DELETE CASCADE,
                FOREIGN KEY (SearchLogId) REFERENCES search_logs(SearchLogId),
                UNIQUE (CompanyNumber, VersionNumber)
            );

            CREATE INDEX IF NOT EXISTS idx_company_history_lookup
            ON CompanyHistory (CompanyNumber, VersionNumber DESC);
            """;
        await cmd.ExecuteNonQueryAsync(cancellationToken);

        cmd.CommandText = "SELECT COUNT(*) FROM SchemaMigrations WHERE MigrationId = @MigrationId;";
        cmd.Parameters.Clear();
        cmd.Parameters.AddWithValue("@MigrationId", VersionHistoryMigration);
        var migrationApplied = Convert.ToInt64(await cmd.ExecuteScalarAsync(cancellationToken)) > 0;
        if (!migrationApplied)
        {
            await BackfillCompanyHistoryAsync(connection, cancellationToken);
            cmd.CommandText = "INSERT INTO SchemaMigrations (MigrationId) VALUES (@MigrationId);";
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task EnableForeignKeysAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "PRAGMA foreign_keys = ON;";
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task AddColumnIfMissingAsync(
        SqliteConnection connection,
        string tableName,
        string columnName,
        string declaration,
        CancellationToken cancellationToken)
    {
        await using var infoCmd = connection.CreateCommand();
        infoCmd.CommandText = $"PRAGMA table_info({tableName});";
        await using var reader = await infoCmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (string.Equals(reader.GetString(1), columnName, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        await using var alterCmd = connection.CreateCommand();
        alterCmd.CommandText = $"ALTER TABLE {tableName} ADD COLUMN {columnName} {declaration};";
        await alterCmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task BackfillCompanyHistoryAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        var companies = new List<CompanyDbRecord>();
        await using (var selectCmd = connection.CreateCommand())
        {
            selectCmd.CommandText = "SELECT CompanyNumber, CompanyName, CompanyStatus, IncorporationDate, Address, ExternalRegistrationNumber FROM Companies;";
            await using var reader = await selectCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                companies.Add(new CompanyDbRecord
                {
                    CompanyNumber = reader.GetString(0),
                    CompanyName = reader.GetString(1),
                    CompanyStatus = reader.IsDBNull(2) ? null : reader.GetString(2),
                    IncorporationDate = reader.IsDBNull(3) ? null : reader.GetString(3),
                    Address = reader.IsDBNull(4) ? null : reader.GetString(4),
                    ExternalRegistrationNumber = reader.IsDBNull(5) ? null : reader.GetString(5)
                });
            }
        }

        foreach (var company in companies)
        {
            var hash = ComputeContentHash(company);
            await using var updateCmd = connection.CreateCommand();
            updateCmd.CommandText = "UPDATE Companies SET CurrentVersion = 1, ContentHash = @ContentHash WHERE CompanyNumber = @CompanyNumber;";
            updateCmd.Parameters.AddWithValue("@ContentHash", hash);
            updateCmd.Parameters.AddWithValue("@CompanyNumber", company.CompanyNumber);
            await updateCmd.ExecuteNonQueryAsync(cancellationToken);

            await InsertHistoryAsync(connection, null, company, hash, 1, null, cancellationToken);
        }
    }

    private static async Task<long> InsertSearchLogAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string userInput,
        int httpStatus,
        int resultCount,
        string? apiResponse,
        CancellationToken cancellationToken)
    {
        await using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = """
            INSERT INTO search_logs (UserInput, SearchedAt, ApiResponse, ResultCount, HttpStatus)
            VALUES (@UserInput, datetime('now'), @ApiResponse, @ResultCount, @HttpStatus);
            SELECT last_insert_rowid();
            """;
        cmd.Parameters.AddWithValue("@UserInput", userInput);
        cmd.Parameters.AddWithValue("@ApiResponse", (object?)apiResponse ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@ResultCount", resultCount);
        cmd.Parameters.AddWithValue("@HttpStatus", httpStatus);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task UpsertVersionedCompanyAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CompanyDbRecord company,
        string contentHash,
        int currentVersion,
        CancellationToken cancellationToken)
    {
        await using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = """
            INSERT INTO Companies (
                CompanyNumber, CompanyName, CompanyStatus, IncorporationDate, Address,
                ExternalRegistrationNumber, CurrentVersion, ContentHash, LastSeenAt
            ) VALUES (
                @CompanyNumber, @CompanyName, @CompanyStatus, @IncorporationDate, @Address,
                @ExternalRegistrationNumber, @CurrentVersion, @ContentHash, CURRENT_TIMESTAMP
            )
            ON CONFLICT(CompanyNumber) DO UPDATE SET
                CompanyName = excluded.CompanyName,
                CompanyStatus = excluded.CompanyStatus,
                IncorporationDate = excluded.IncorporationDate,
                Address = excluded.Address,
                ExternalRegistrationNumber = excluded.ExternalRegistrationNumber,
                CurrentVersion = excluded.CurrentVersion,
                ContentHash = excluded.ContentHash,
                LastSeenAt = CURRENT_TIMESTAMP;
            """;
        AddCompanyParameters(cmd, company);
        cmd.Parameters.AddWithValue("@CurrentVersion", currentVersion);
        cmd.Parameters.AddWithValue("@ContentHash", contentHash);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertHistoryAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        CompanyDbRecord company,
        string contentHash,
        int versionNumber,
        long? searchLogId,
        CancellationToken cancellationToken)
    {
        await using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = """
            INSERT OR IGNORE INTO CompanyHistory (
                CompanyNumber, VersionNumber, CompanyName, CompanyStatus, IncorporationDate,
                Address, ExternalRegistrationNumber, ContentHash, SearchLogId
            ) VALUES (
                @CompanyNumber, @VersionNumber, @CompanyName, @CompanyStatus, @IncorporationDate,
                @Address, @ExternalRegistrationNumber, @ContentHash, @SearchLogId
            );
            """;
        AddCompanyParameters(cmd, company);
        cmd.Parameters.AddWithValue("@VersionNumber", versionNumber);
        cmd.Parameters.AddWithValue("@ContentHash", contentHash);
        cmd.Parameters.AddWithValue("@SearchLogId", (object?)searchLogId ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void AddCompanyParameters(SqliteCommand cmd, CompanyDbRecord company)
    {
        cmd.Parameters.AddWithValue("@CompanyNumber", company.CompanyNumber);
        cmd.Parameters.AddWithValue("@CompanyName", company.CompanyName);
        cmd.Parameters.AddWithValue("@CompanyStatus", (object?)company.CompanyStatus ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@IncorporationDate", (object?)company.IncorporationDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@Address", (object?)company.Address ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@ExternalRegistrationNumber", (object?)company.ExternalRegistrationNumber ?? DBNull.Value);
    }

    private static string ComputeContentHash(CompanyDbRecord company)
    {
        var raw = $"{company.CompanyName.Trim().ToUpperInvariant()}|" +
                  $"{(company.CompanyStatus ?? string.Empty).Trim().ToLowerInvariant()}|" +
                  $"{(company.IncorporationDate ?? string.Empty).Trim()}|" +
                  $"{(company.Address ?? string.Empty).Trim()}|" +
                  $"{(company.ExternalRegistrationNumber ?? string.Empty).Trim()}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes).ToLowerInvariant();
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
