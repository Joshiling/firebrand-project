using Microsoft.Data.Sqlite;

const string companyNumber = "00002065";
var databasePath = Path.GetFullPath(args.FirstOrDefault() ?? "database.db");

if (!File.Exists(databasePath))
{
    Console.Error.WriteLine($"Database not found: {databasePath}");
    return 1;
}

var versions = new[]
{
    new CompanyVersion(
        1,
        "2024-01-15 09:00:00",
        "LLOYDS BANK LIMITED",
        "71 Lombard Street, London, EC3P 3BS",
        "f976037a53d82b1350625864a6f0804aaf5ba81bc3c12a716459e7b3029b7325"),
    new CompanyVersion(
        2,
        "2025-05-10 14:15:00",
        "LLOYDS BANK PLC",
        "71 Lombard Street, London, EC3P 3BS",
        "61d253b41e8cbebf4f994dd3335a69c0caa88a7d27b7ce1477151cb064554ddc"),
    new CompanyVersion(
        3,
        "2026-09-29 10:30:00",
        "LLOYDS BANK PLC",
        "25 Gresham Street, London, EC2V 7HN",
        "5b53f8aaec5f6e57be5923078ecf494ea61a33535b8d0d9799e0581903e7cef0")
};

await using var connection = new SqliteConnection($"Data Source={databasePath}");
await connection.OpenAsync();

await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync();
try
{
    await using (var companyCommand = connection.CreateCommand())
    {
        companyCommand.Transaction = transaction;
        companyCommand.CommandText = """
            INSERT INTO Companies (
                CompanyNumber, CompanyName, CompanyStatus, IncorporationDate, Address,
                ExternalRegistrationNumber, CurrentVersion, ContentHash, LastSeenAt
            ) VALUES (
                @CompanyNumber, @CompanyName, 'active', '1865-04-20', @Address,
                NULL, 3, @ContentHash, CURRENT_TIMESTAMP
            )
            ON CONFLICT(CompanyNumber) DO UPDATE SET
                CompanyName = excluded.CompanyName,
                CompanyStatus = excluded.CompanyStatus,
                IncorporationDate = excluded.IncorporationDate,
                Address = excluded.Address,
                CurrentVersion = excluded.CurrentVersion,
                ContentHash = excluded.ContentHash,
                LastSeenAt = CURRENT_TIMESTAMP;
            """;
        companyCommand.Parameters.AddWithValue("@CompanyNumber", companyNumber);
        companyCommand.Parameters.AddWithValue("@CompanyName", versions[^1].CompanyName);
        companyCommand.Parameters.AddWithValue("@Address", versions[^1].Address);
        companyCommand.Parameters.AddWithValue("@ContentHash", versions[^1].ContentHash);
        await companyCommand.ExecuteNonQueryAsync();
    }

    await using (var deleteCommand = connection.CreateCommand())
    {
        deleteCommand.Transaction = transaction;
        deleteCommand.CommandText = "DELETE FROM CompanyHistory WHERE CompanyNumber = @CompanyNumber;";
        deleteCommand.Parameters.AddWithValue("@CompanyNumber", companyNumber);
        await deleteCommand.ExecuteNonQueryAsync();
    }

    foreach (var version in versions)
    {
        await using var historyCommand = connection.CreateCommand();
        historyCommand.Transaction = transaction;
        historyCommand.CommandText = """
            INSERT INTO CompanyHistory (
                CompanyNumber, VersionNumber, CompanyName, CompanyStatus, IncorporationDate,
                Address, ExternalRegistrationNumber, ContentHash, RecordedAt, SearchLogId
            ) VALUES (
                @CompanyNumber, @VersionNumber, @CompanyName, 'active', '1865-04-20',
                @Address, NULL, @ContentHash, @RecordedAt, NULL
            );
            """;
        historyCommand.Parameters.AddWithValue("@CompanyNumber", companyNumber);
        historyCommand.Parameters.AddWithValue("@VersionNumber", version.VersionNumber);
        historyCommand.Parameters.AddWithValue("@CompanyName", version.CompanyName);
        historyCommand.Parameters.AddWithValue("@Address", version.Address);
        historyCommand.Parameters.AddWithValue("@ContentHash", version.ContentHash);
        historyCommand.Parameters.AddWithValue("@RecordedAt", version.RecordedAt);
        await historyCommand.ExecuteNonQueryAsync();
    }

    await transaction.CommitAsync();
    Console.WriteLine($"Seeded {versions.Length} Lloyds versions in {databasePath}");
    return 0;
}
catch
{
    await transaction.RollbackAsync();
    throw;
}

internal sealed record CompanyVersion(
    int VersionNumber,
    string RecordedAt,
    string CompanyName,
    string Address,
    string ContentHash);