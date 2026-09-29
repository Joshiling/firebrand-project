using Api.Database;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace Api.Tests;

public sealed class CompanyDatabaseServiceTests : IDisposable
{
    private readonly string _tempDbPath;
    private readonly CompanyDatabaseService _databaseService;

    public CompanyDatabaseServiceTests()
    {
        _tempDbPath = Path.Combine(Path.GetTempPath(), $"test_db_{Guid.NewGuid():N}.db");

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:CompanyDatabase"] = $"Data Source={_tempDbPath}"
            })
            .Build();

        var hostEnv = new TestHostEnvironment();
        var logger = NullLogger<CompanyDatabaseService>.Instance;

        _databaseService = new CompanyDatabaseService(config, hostEnv, logger);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (File.Exists(_tempDbPath))
        {
            try
            {
                File.Delete(_tempDbPath);
            }
            catch
            {
                // Best-effort cleanup
            }
        }
    }

    [Fact]
    public async Task SaveSearchLogAsync_WithCompanies_WritesLogCompaniesAndLinks()
    {
        // Arrange
        var testCompanies = new[]
        {
            new CompanyDbRecord
            {
                CompanyNumber = "00002065",
                CompanyName = "LLOYDS BANK PLC",
                CompanyStatus = "active",
                IncorporationDate = "1865-04-20",
                Address = "25 Gresham Street, London, EC2V 7HN",
                ExternalRegistrationNumber = null
            },
            new CompanyDbRecord
            {
                CompanyNumber = "FC036349",
                CompanyName = "VOICESAGE GLOBAL HOLDINGS",
                CompanyStatus = "active",
                IncorporationDate = "2019-06-03",
                Address = "1st Floor, London",
                ExternalRegistrationNumber = "348563"
            }
        };

        // Act
        var logId = await _databaseService.SaveSearchLogAsync(
            userInput: "test search",
            httpStatus: 200,
            resultCount: 2,
            apiResponse: "{\"mock\": true}",
            companies: testCompanies);

        // Assert
        Assert.True(logId > 0);

        await using var connection = new SqliteConnection($"Data Source={_tempDbPath}");
        await connection.OpenAsync();

        // 1. Verify search_logs row
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT UserInput, HttpStatus, ResultCount, ApiResponse FROM search_logs WHERE SearchLogId = @id";
            cmd.Parameters.AddWithValue("@id", logId);
            await using var reader = await cmd.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal("test search", reader.GetString(0));
            Assert.Equal(200, reader.GetInt32(1));
            Assert.Equal(2, reader.GetInt32(2));
            Assert.Equal("{\"mock\": true}", reader.GetString(3));
        }

        // 2. Verify Companies table
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT CompanyName, ExternalRegistrationNumber FROM Companies WHERE CompanyNumber = 'FC036349'";
            await using var reader = await cmd.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal("VOICESAGE GLOBAL HOLDINGS", reader.GetString(0));
            Assert.Equal("348563", reader.GetString(1));
        }

        // 3. Verify join query from DB_Guide.md
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = """
                SELECT
                    l.SearchLogId,
                    l.UserInput,
                    l.HttpStatus,
                    c.CompanyNumber,
                    c.CompanyName
                FROM search_logs AS l
                LEFT JOIN search_log_companies AS link
                    ON link.SearchLogId = l.SearchLogId
                LEFT JOIN Companies AS c
                    ON c.CompanyNumber = link.CompanyNumber
                WHERE l.SearchLogId = @id
                ORDER BY c.CompanyNumber;
                """;
            cmd.Parameters.AddWithValue("@id", logId);
            await using var reader = await cmd.ExecuteReaderAsync();

            var rows = new List<(string Number, string Name)>();
            while (await reader.ReadAsync())
            {
                rows.Add((reader.GetString(3), reader.GetString(4)));
            }

            Assert.Equal(2, rows.Count);
            Assert.Equal("00002065", rows[0].Number);
            Assert.Equal("LLOYDS BANK PLC", rows[0].Name);
            Assert.Equal("FC036349", rows[1].Number);
            Assert.Equal("VOICESAGE GLOBAL HOLDINGS", rows[1].Name);
        }
    }

    [Fact]
    public async Task SaveSearchLogAsync_WithZeroResults_InsertsSearchLogWithoutCompanyLinks()
    {
        // Act
        var logId = await _databaseService.SaveSearchLogAsync(
            userInput: "nonexistent",
            httpStatus: 404,
            resultCount: 0,
            apiResponse: null,
            companies: Array.Empty<CompanyDbRecord>());

        // Assert
        Assert.True(logId > 0);

        await using var connection = new SqliteConnection($"Data Source={_tempDbPath}");
        await connection.OpenAsync();

        // Verify search_logs exists
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT HttpStatus, ResultCount, ApiResponse FROM search_logs WHERE SearchLogId = @id";
            cmd.Parameters.AddWithValue("@id", logId);
            await using var reader = await cmd.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal(404, reader.GetInt32(0));
            Assert.Equal(0, reader.GetInt32(1));
            Assert.True(reader.IsDBNull(2));
        }

        // Verify no links exist
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT COUNT(*) FROM search_log_companies WHERE SearchLogId = @id";
            cmd.Parameters.AddWithValue("@id", logId);
            var linkCount = Convert.ToInt64(await cmd.ExecuteScalarAsync());
            Assert.Equal(0, linkCount);
        }
    }

    [Fact]
    public async Task GetSearchLogsAsync_ReturnsNewestPageWithoutRawApiResponse()
    {
        await _databaseService.SaveSearchLogAsync(
            "first search",
            200,
            4,
            "{\"large\":\"response\"}",
            Array.Empty<CompanyDbRecord>());
        var newestId = await _databaseService.SaveSearchLogAsync(
            "latest search",
            502,
            0,
            "upstream failure",
            Array.Empty<CompanyDbRecord>());

        var result = await _databaseService.GetSearchLogsAsync(page: 1, pageSize: 1);

        var log = Assert.Single(result.Items);
        Assert.Equal(2, result.TotalResults);
        Assert.Equal(1, result.Page);
        Assert.Equal(1, result.PageSize);
        Assert.Equal(newestId, log.SearchLogId);
        Assert.Equal("latest search", log.UserInput);
        Assert.Null(log.CompanyName);
        Assert.Equal(0, log.ResultCount);
        Assert.Equal(502, log.HttpStatus);
        Assert.Equal(TimeSpan.Zero, log.SearchedAt.Offset);
    }

    [Fact]
    public async Task GetSearchLogsAsync_FiltersByLinkedCompanyAndReturnsSingleCompanyName()
    {
        var company = new CompanyDbRecord
        {
            CompanyNumber = "00002065",
            CompanyName = "LLOYDS BANK PLC",
            CompanyStatus = "active"
        };
        await _databaseService.SaveSearchLogAsync("00002065", 200, 1, null, [company]);
        await _databaseService.SaveSearchLogAsync("unrelated", 200, 0, null, []);

        var result = await _databaseService.GetSearchLogsAsync(1, 20, "lloyds");

        var log = Assert.Single(result.Items);
        Assert.Equal(1, result.TotalResults);
        Assert.Equal("lloyds", result.Query);
        Assert.Equal("LLOYDS BANK PLC", log.CompanyName);
    }

    [Fact]
    public async Task SaveSearchLogAsync_Upsert_PreservesExistingExternalRegistrationNumberWhenNull()
    {
        // 1. Insert initial company with ExternalRegistrationNumber
        var initialRecord = new[]
        {
            new CompanyDbRecord
            {
                CompanyNumber = "FC036349",
                CompanyName = "ORIGINAL NAME",
                CompanyStatus = "active",
                Address = "Old Address",
                ExternalRegistrationNumber = "EXT-999"
            }
        };

        await _databaseService.SaveSearchLogAsync("initial", 200, 1, null, initialRecord);

        // 2. Upsert same company with new name, but ExternalRegistrationNumber is null
        var updatedRecord = new[]
        {
            new CompanyDbRecord
            {
                CompanyNumber = "FC036349",
                CompanyName = "UPDATED NAME",
                CompanyStatus = "active",
                Address = "New Address",
                ExternalRegistrationNumber = null
            }
        };

        await _databaseService.SaveSearchLogAsync("updated", 200, 1, null, updatedRecord);

        // Assert
        await using var connection = new SqliteConnection($"Data Source={_tempDbPath}");
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT CompanyName, Address, ExternalRegistrationNumber FROM Companies WHERE CompanyNumber = 'FC036349'";
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("UPDATED NAME", reader.GetString(0));
        Assert.Equal("New Address", reader.GetString(1));
        // coalesce preserved EXT-999
        Assert.Equal("EXT-999", reader.GetString(2));
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
