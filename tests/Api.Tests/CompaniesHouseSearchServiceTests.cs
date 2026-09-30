using System.Net;
using Api.Database;
using Api.Exceptions;
using Api.Models;
using Api.Services;
using Microsoft.Extensions.Configuration;

namespace Api.Tests;

public sealed class CompaniesHouseSearchServiceTests
{
    private readonly RecordingCompanyDatabaseService _databaseService = new();

    [Fact]
    public async Task SearchAsync_OnSuccess_LogsSearchAndReturnsCompanies()
    {
        // Arrange
        const string searchJson = """
            {
              "items": [
                {
                  "company_number": "00002065",
                  "title": "LLOYDS BANK PLC",
                  "company_status": "active",
                  "company_type": "plc",
                  "date_of_creation": "1865-04-20",
                  "address_snippet": "25 Gresham Street, London"
                }
              ],
              "total_results": 1
            }
            """;

        var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.OK, searchJson);
        var configuration = CreateConfiguration();

        var service = new CompaniesHouseSearchService(httpClientFactory, configuration, _databaseService);

        // Act
        var results = await service.SearchAsync("Lloyds", CancellationToken.None);

        // Assert
        Assert.Single(results);
        Assert.Equal("LLOYDS BANK PLC", results[0].Name);
        Assert.Equal("00002065", results[0].CompanyNumber);
        Assert.Equal("00002065", results[0].RegistryId);

        // Verify database logging
        Assert.Single(_databaseService.SavedLogs);
        var log = _databaseService.SavedLogs[0];
        Assert.Equal("Lloyds", log.UserInput);
        Assert.Equal(200, log.HttpStatus);
        Assert.Equal(1, log.ResultCount);
        Assert.Equal(searchJson, log.ApiResponse);
        Assert.Single(log.Companies);
        Assert.Equal("00002065", log.Companies.First().CompanyNumber);
        Assert.Equal("LLOYDS BANK PLC", log.Companies.First().CompanyName);
    }

        [Fact]
        public async Task SearchAsync_PrioritisesCurrentNameMatchesOverBroadSubstringMatches()
        {
                // Arrange
                const string searchJson = """
                        {
                            "items": [
                                {
                                    "company_number": "10000001",
                                    "title": "Bulgarian Fruits LIMITED",
                                    "company_status": "active"
                                },
                                {
                                    "company_number": "00002065",
                                    "title": "LLOYDS BANK PLC",
                                    "company_status": "active"
                                }
                            ],
                            "total_results": 2
                        }
                        """;

                var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.OK, searchJson);
                var configuration = CreateConfiguration();
                var service = new CompaniesHouseSearchService(httpClientFactory, configuration, _databaseService);

                // Act
                var results = await service.SearchAsync("Lloyds", CancellationToken.None);

                // Assert
                // The current name match should appear before a result that only matched an old name.
                Assert.Equal("LLOYDS BANK PLC", results[0].Name);
                Assert.Equal("Bulgarian Fruits LIMITED", results[1].Name);
        }

    [Fact]
    public async Task SearchAsync_OnApiError_LogsFailureAndRethrows()
    {
        // Arrange
        var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.ServiceUnavailable, "Service Unavailable");
        var configuration = CreateConfiguration();

        var service = new CompaniesHouseSearchService(httpClientFactory, configuration, _databaseService);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<CompaniesHouseApiException>(
            () => service.SearchAsync("failed-search", CancellationToken.None));

        // Verify error log was written to database
        Assert.Single(_databaseService.SavedLogs);
        var log = _databaseService.SavedLogs[0];
        Assert.Equal("failed-search", log.UserInput);
        Assert.Equal(ex.StatusCode, log.HttpStatus);
        Assert.Equal(0, log.ResultCount);
        Assert.Empty(log.Companies);
    }

    [Fact]
    public async Task GetByRegistryIdAsync_OnSuccess_LogsLookupAndReturnsCompany()
    {
        // Arrange
        const string profileJson = """
            {
              "company_name": "LLOYDS BANK PLC",
              "company_number": "00002065",
              "company_status": "active",
              "type": "plc",
              "date_of_creation": "1865-04-20"
            }
            """;

        var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.OK, profileJson);
        var configuration = CreateConfiguration();

        var service = new CompaniesHouseSearchService(httpClientFactory, configuration, _databaseService);

        // Act
        var company = await service.GetByRegistryIdAsync("00002065", CancellationToken.None);

        // Assert
        Assert.NotNull(company);
        Assert.Equal("LLOYDS BANK PLC", company.Name);
        Assert.Equal("00002065", company.CompanyNumber);
        Assert.Equal("00002065", company.RegistryId);

        Assert.Equal(1, company.VersionCount);
        var profile = Assert.Single(_databaseService.SavedProfiles);
        Assert.Equal("00002065", profile.RegistryId);
        Assert.Equal(200, profile.HttpStatus);
        Assert.Equal(profileJson, profile.RawJson);
        Assert.Equal("00002065", profile.Company.CompanyNumber);
    }

    [Fact]
    public async Task GetByRegistryIdAsync_OnNotFound_Logs404AndReturnsNull()
    {
        // Arrange
        var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.NotFound, "");
        var configuration = CreateConfiguration();

        var service = new CompaniesHouseSearchService(httpClientFactory, configuration, _databaseService);

        // Act
        var company = await service.GetByRegistryIdAsync("99999999", CancellationToken.None);

        // Assert
        Assert.Null(company);

        // Verify 404 logged to database
        Assert.Single(_databaseService.SavedLogs);
        var log = _databaseService.SavedLogs[0];
        Assert.Equal("99999999", log.UserInput);
        Assert.Equal(404, log.HttpStatus);
        Assert.Equal(0, log.ResultCount);
        Assert.Empty(log.Companies);
    }

    private static IConfiguration CreateConfiguration() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["CompaniesHouse:ApiKey"] = "test-api-key"
            })
            .Build();

    private static IHttpClientFactory CreateHttpClientFactory(HttpStatusCode statusCode, string content)
    {
        var handler = new MockHttpMessageHandler(statusCode, content);
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api.company-information.service.gov.uk/")
        };

        return new MockHttpClientFactory(client);
    }

    private sealed class MockHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    private sealed class MockHttpMessageHandler(HttpStatusCode statusCode, string content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(content)
            };
            return Task.FromResult(response);
        }
    }

    private sealed class RecordingCompanyDatabaseService : ICompanyDatabaseService
    {
        public List<SavedLogEntry> SavedLogs { get; } = new();
        public List<SavedProfileEntry> SavedProfiles { get; } = new();

        public Task<SearchLogPage> GetSearchLogsAsync(
            int page,
            int pageSize,
            string? query = null,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new SearchLogPage([], 0, page, pageSize, query));

        public Task<long> SaveSearchLogAsync(
            string userInput,
            int httpStatus,
            int resultCount,
            string? apiResponse,
            IReadOnlyCollection<CompanyDbRecord> companies,
            CancellationToken cancellationToken = default)
        {
            SavedLogs.Add(new SavedLogEntry(userInput, httpStatus, resultCount, apiResponse, companies));
            return Task.FromResult((long)SavedLogs.Count);
        }

        public Task<CompanyVersionResult> SaveCompanyProfileWithVersionAsync(
            string registryId,
            int httpStatus,
            string? rawJson,
            CompanyDbRecord companyRecord,
            CancellationToken cancellationToken = default)
        {
            SavedProfiles.Add(new SavedProfileEntry(registryId, httpStatus, rawJson, companyRecord));
            return Task.FromResult(new CompanyVersionResult
            {
                SearchLogId = SavedProfiles.Count,
                CurrentVersion = 1,
                TotalVersions = 1,
                HasChanged = true
            });
        }

        public Task<IReadOnlyList<CompanyHistoryRecord>> GetCompanyHistoryAsync(
            string companyNumber,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<CompanyHistoryRecord>>(Array.Empty<CompanyHistoryRecord>());
    }

    private sealed record SavedLogEntry(
        string UserInput,
        int HttpStatus,
        int ResultCount,
        string? ApiResponse,
        IReadOnlyCollection<CompanyDbRecord> Companies);

    private sealed record SavedProfileEntry(
        string RegistryId,
        int HttpStatus,
        string? RawJson,
        CompanyDbRecord Company);
}
