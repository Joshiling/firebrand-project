using System.Net;
using System.Text.Json;
using Api.Database;
using Api.Endpoints;
using Api.Models;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Api.Tests;

public sealed class SearchLogEndpointTests : IAsyncLifetime
{
    private readonly RecordingDatabase _database = new();
    private WebApplication _app = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Services.AddSingleton<ICompanyDatabaseService>(_database);
        _app = builder.Build();
        _app.MapSearchLogEndpoints();
        _app.Urls.Add("http://127.0.0.1:0");
        await _app.StartAsync();
        _client = new HttpClient { BaseAddress = new Uri(_app.Urls.Single()) };
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Get_DefaultsAndJsonContractExcludeRawResponse()
    {
        using var response = await _client.GetAsync("/search_logs");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal((1, 20, (string?)null), Assert.Single(_database.Reads));
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(new[] { "items", "page", "pageSize", "query", "totalResults" },
            root.EnumerateObject().Select(property => property.Name).OrderBy(name => name));
        Assert.Equal(new[] { "companyName", "httpStatus", "resultCount", "searchedAt", "searchLogId", "userInput" },
            root.GetProperty("items")[0].EnumerateObject().Select(property => property.Name).OrderBy(name => name));
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    [InlineData("page=1.5")]
    [InlineData("page=2147483648")]
    [InlineData("page=invalid")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=101")]
    public async Task Get_InvalidPaginationIsRejectedBeforeDatabaseRead(string parameters)
    {
        using var response = await _client.GetAsync($"/search_logs?{parameters}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(_database.Reads);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(100)]
    public async Task Get_AcceptsPageSizeBoundariesAndEncodedLiteralQuery(int pageSize)
    {
        const string query = "A & B + 100%_";
        using var response = await _client.GetAsync($"/search_logs?page=2147483647&pageSize={pageSize}&query={Uri.EscapeDataString(query)}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal((int.MaxValue, pageSize, query), Assert.Single(_database.Reads));
    }

    [Theory]
    [InlineData(100, HttpStatusCode.OK)]
    [InlineData(101, HttpStatusCode.BadRequest)]
    public async Task Get_EnforcesQueryLength(int length, HttpStatusCode expected)
    {
        using var response = await _client.GetAsync($"/search_logs?query={new string('a', length)}");
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(expected == HttpStatusCode.OK ? 1 : 0, _database.Reads.Count);
    }

    private sealed class RecordingDatabase : ICompanyDatabaseService
    {
        public List<(int Page, int PageSize, string? Query)> Reads { get; } = [];

        public Task<SearchLogPage> GetSearchLogsAsync(int page, int pageSize, string? query = null, CancellationToken cancellationToken = default)
        {
            Reads.Add((page, pageSize, query));
            return Task.FromResult(new SearchLogPage([
                new SearchLogEntry(1, "Lloyds", null, DateTimeOffset.UnixEpoch, 1, 200)
            ], 1, page, pageSize, query));
        }

        public Task<long> SaveSearchLogAsync(string userInput, int httpStatus, int resultCount, string? apiResponse,
            IReadOnlyCollection<CompanyDbRecord> companies, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("The read endpoint must not write logs.");

        public Task<CompanyVersionResult> SaveCompanyProfileWithVersionAsync(string registryId, int httpStatus,
            string? rawJson, CompanyDbRecord companyRecord, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("The read endpoint must not write profiles.");

        public Task<IReadOnlyList<CompanyHistoryRecord>> GetCompanyHistoryAsync(string companyNumber,
            CancellationToken cancellationToken = default) => throw new InvalidOperationException("Unexpected history access.");
    }
}