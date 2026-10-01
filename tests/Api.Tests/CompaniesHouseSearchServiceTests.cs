using System.Net;
using System.Text.Json;
using Api.Database;
using Api.Exceptions;
using Api.Models;
using Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.WebUtilities;

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
    public async Task SearchByNameAsync_WithFilters_UsesAdvancedSearchAndMapsResults()
    {
        const string searchJson = """
                        {
                            "items": [
                                {
                                    "company_name": "LLOYDS BANK PLC",
                                    "company_number": "00002065",
                                    "company_status": "active",
                                    "company_type": "plc",
                                    "registered_office_address": {
                                        "address_line_1": "25 Gresham Street",
                                        "locality": "London",
                                        "country": "England"
                                    }
                                }
                            ],
                            "total_results": 1
                        }
                        """;
        Uri? requestUri = null;
        var httpClientFactory = CreateHttpClientFactory(
                HttpStatusCode.OK,
                searchJson,
                request => requestUri = request.RequestUri);
        var service = new CompaniesHouseSearchService(httpClientFactory, CreateConfiguration(), _databaseService);

        var results = await service.SearchByNameAsync(
                "Lloyds & Co",
                new CompanySearchFilters
                {
                    CompanyStatuses = [CompanyStatusFilter.Active, CompanyStatusFilter.Dissolved],
                    CompanyTypes = [CompanyTypeFilter.Plc],
                    City = "London",
                    Country = RegisteredOfficeCountryFilter.England
                },
                CancellationToken.None);

        Assert.Single(results);
        Assert.Equal("LLOYDS BANK PLC", results[0].Name);
        Assert.Equal("00002065", results[0].RegistryId);
        Assert.Equal("active", results[0].CompanyStatus);
        Assert.Equal("plc", results[0].CompanyType);
        Assert.NotNull(requestUri);
        Assert.Equal("/advanced-search/companies", requestUri.AbsolutePath);
        var query = QueryHelpers.ParseQuery(requestUri.Query);
        Assert.Equal("Lloyds & Co", query["company_name_includes"]);
        Assert.Equal(new[] { "active", "dissolved" }, query["company_status"].ToArray());
        Assert.Equal("plc", query["company_type"]);
        Assert.Equal("London", query["location"]);
        Assert.Equal("100", query["size"]);
        Assert.Equal("0", query["start_index"]);
        Assert.Equal("Lloyds & Co [company_status=active,dissolved; company_type=plc; city=London; country=England]", _databaseService.SavedLogs[0].UserInput);
    }

    [Fact]
    public async Task SearchByRegistryIdAsync_WithFilters_FiltersTheExactIdResultsLocally()
    {
        const string searchJson = """
                        {
                            "items": [
                                {
                                    "company_number": "00002065",
                                    "title": "LLOYDS BANK PLC",
                                    "company_status": "active",
                                    "company_type": "plc",
                                    "address": { "address_line_1": "25 Gresham Street", "locality": "London", "country": "England" }
                                },
                                {
                                    "company_number": "00002066",
                                    "title": "OTHER COMPANY LTD",
                                    "company_status": "dissolved",
                                    "company_type": "ltd",
                                    "address": { "locality": "Bristol" }
                                }
                            ],
                            "total_results": 2
                        }
                        """;
        Uri? requestUri = null;
        var httpClientFactory = CreateHttpClientFactory(
                HttpStatusCode.OK,
                searchJson,
                request => requestUri = request.RequestUri);
        var service = new CompaniesHouseSearchService(httpClientFactory, CreateConfiguration(), _databaseService);

        var results = await service.SearchByRegistryIdAsync(
                "00002065",
                new CompanySearchFilters
                {
                    CompanyStatuses = [CompanyStatusFilter.Active],
                    CompanyTypes = [CompanyTypeFilter.Plc],
                    City = "london",
                    Country = RegisteredOfficeCountryFilter.England
                },
                CancellationToken.None);

        var result = Assert.Single(results);
        Assert.Equal("00002065", result.RegistryId);
        Assert.NotNull(requestUri);
        Assert.Equal("/search/companies", requestUri.AbsolutePath);
        Assert.Equal("00002065", QueryHelpers.ParseQuery(requestUri.Query)["q"]);
        Assert.Equal("00002065 [company_status=active; company_type=plc; city=london; country=England]", _databaseService.SavedLogs[0].UserInput);
        Assert.Equal(1, _databaseService.SavedLogs[0].ResultCount);
    }

    [Fact]
    public async Task SearchByNameAsync_WhenAdvancedSearchReturnsNotFound_ReturnsEmptyList()
    {
        var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.NotFound, "");
        var service = new CompaniesHouseSearchService(httpClientFactory, CreateConfiguration(), _databaseService);

        var results = await service.SearchByNameAsync(
                "No matching company",
                new CompanySearchFilters { CompanyTypes = [CompanyTypeFilter.Plc] },
                CancellationToken.None);

        Assert.Empty(results);
        Assert.Equal(200, _databaseService.SavedLogs[0].HttpStatus);
        Assert.Equal(0, _databaseService.SavedLogs[0].ResultCount);
    }

        [Fact]
        public async Task SearchByNameAsync_LocationDoesNotMatchStreetNameInsteadOfLocality()
        {
                const string searchJson = """
                        {
                            "items": [
                                {
                                    "company_name": "WINSTANLEY COMPANY LTD",
                                    "company_number": "00002065",
                                    "company_status": "active",
                                    "company_type": "ltd",
                                    "registered_office_address": {
                                        "address_line_1": "3 Paris Avenue",
                                        "locality": "Wigan",
                                        "postal_code": "WN3 6FA",
                                        "country": "England"
                                    }
                                }
                            ],
                            "total_results": 1
                        }
                        """;
                var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.OK, searchJson);
                var service = new CompaniesHouseSearchService(httpClientFactory, CreateConfiguration(), _databaseService);

                var results = await service.SearchByNameAsync(
                        "Winstanley",
                        new CompanySearchFilters { City = "Paris" },
                        CancellationToken.None);

                Assert.Empty(results);
        }

        [Fact]
        public async Task SearchByNameAsync_CountryFilterMatchesRegisteredOfficeCountry()
        {
                const string searchJson = """
                        {
                            "items": [
                                {
                                    "company_name": "LONDON COMPANY LTD",
                                    "company_number": "00002065",
                                    "company_status": "active",
                                    "company_type": "ltd",
                                    "registered_office_address": {
                                        "locality": "London",
                                        "country": "England"
                                    }
                                }
                            ],
                            "total_results": 1
                        }
                        """;
                var httpClientFactory = CreateHttpClientFactory(HttpStatusCode.OK, searchJson);
                var service = new CompaniesHouseSearchService(httpClientFactory, CreateConfiguration(), _databaseService);

                var results = await service.SearchByNameAsync(
                        "London Company",
                        new CompanySearchFilters { Country = RegisteredOfficeCountryFilter.Scotland },
                        CancellationToken.None);

                Assert.Empty(results);
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

    [Fact]
    public async Task GetByRegistryIdAsync_PreservesOwnedProfileFieldsAndNestedWireNames()
    {
        const string json = """
            {
              "company_name":"TEST PLC", "company_number":"00000001", "type":"plc",
              "accounts":{
                "accounting_reference_date":{"day":"31","month":"12"},
                "last_accounts":{"made_up_to":"2024-12-31","period_start_on":"2024-01-01","period_end_on":"2024-12-31","type":"small"},
                "next_accounts":{"due_on":"2026-09-30","period_start_on":"2025-01-01","period_end_on":"2025-12-31","overdue":false},
                "next_due":"2026-09-30","next_made_up_to":"2025-12-31","overdue":false
              },
              "confirmation_statement":{"last_made_up_to":"2024-01-01","next_due":"2025-01-15","next_made_up_to":"2025-01-01","overdue":false},
              "can_file":false,"has_charges":false,"has_insolvency_history":false,"has_super_secure_pscs":false,
              "registered_office_is_in_dispute":false,"undeliverable_registered_office_address":false,
              "etag":"etag-value","jurisdiction":"england-wales","last_full_members_list_date":"2016-01-01",
              "sic_codes":["64191"],"links":{"self":"/company/00000001"},
              "previous_company_names":[{"name":"OLD NAME","effective_from":"2000-01-01","ceased_on":"2001-01-01"}],
              "registered_office_address":{"address_line_1":"One Street","postal_code":"AB1 2CD"}
            }
            """;
        var service = new CompaniesHouseSearchService(CreateHttpClientFactory(HttpStatusCode.OK, json), CreateConfiguration(), _databaseService);

        var company = await service.GetByRegistryIdAsync("00000001", CancellationToken.None);

        Assert.NotNull(company);
        Assert.False(company.CanFile);
        Assert.False(company.HasCharges);
        Assert.False(company.HasInsolvencyHistory);
        Assert.False(company.HasSuperSecurePscs);
        Assert.False(company.RegisteredOfficeIsInDispute);
        Assert.False(company.UndeliverableRegisteredOfficeAddress);
        Assert.Equal("etag-value", company.Etag);
        Assert.Equal("england-wales", company.Jurisdiction);
        Assert.Equal(new DateOnly(2016, 1, 1), company.LastFullMembersListDate);
        Assert.Equal(new[] { "64191" }, company.SicCodes);
        Assert.Equal("/company/00000001", company.Links!["self"]);

        using var source = JsonDocument.Parse(json);
        using var response = JsonDocument.Parse(JsonSerializer.Serialize(company, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        foreach (var (sourceName, responseName) in new[] {
            ("accounts", "accounts"), ("confirmation_statement", "confirmationStatement"),
            ("previous_company_names", "previousCompanyNames"), ("registered_office_address", "registeredOfficeAddress") })
        {
            AssertJsonSubset(source.RootElement.GetProperty(sourceName), response.RootElement.GetProperty(responseName));
        }
    }

    [Fact]
    public async Task GetByRegistryIdAsync_LeavesMissingOwnedFieldsNull()
    {
        var service = new CompaniesHouseSearchService(CreateHttpClientFactory(HttpStatusCode.OK,
            """{"company_name":"SPARSE","company_number":"00000002"}"""), CreateConfiguration(), _databaseService);
        var company = await service.GetByRegistryIdAsync("00000002", CancellationToken.None);
        Assert.NotNull(company);
        Assert.Null(company.Accounts);
        Assert.Null(company.CanFile);
        Assert.Null(company.ConfirmationStatement);
        Assert.Null(company.PreviousCompanyNames);
        Assert.Null(company.SicCodes);
    }

    [Fact]
    public async Task SearchAsync_PreservesOwnedSummaryFieldsAndBoundsUpstreamPaging()
    {
        var handler = new MockHttpMessageHandler(HttpStatusCode.OK, """
            {"items":[{"company_number":"00000001","title":"TEST PLC","company_status":"active","company_type":"plc"}],"total_results":10000}
            """, null);
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.company-information.service.gov.uk/") };
        var service = new CompaniesHouseSearchService(new MockHttpClientFactory(client), CreateConfiguration(), _databaseService);

        var result = await service.SearchAsync("TEST", CancellationToken.None);

        var company = Assert.Single(result);
        Assert.Equal("active", company.CompanyStatus);
        Assert.Equal("plc", company.CompanyType);
        Assert.Equal(1, handler.RequestCount);
        Assert.Contains("items_per_page=100", handler.LastRequestUri?.Query);
        Assert.Contains("start_index=0", handler.LastRequestUri?.Query);
    }

    private static void AssertJsonSubset(JsonElement expected, JsonElement actual)
    {
        Assert.Equal(expected.ValueKind, actual.ValueKind);
        if (expected.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in expected.EnumerateObject())
                AssertJsonSubset(property.Value, actual.GetProperty(property.Name));
        }
        else if (expected.ValueKind == JsonValueKind.Array)
        {
            Assert.Equal(expected.GetArrayLength(), actual.GetArrayLength());
            for (var index = 0; index < expected.GetArrayLength(); index++)
                AssertJsonSubset(expected[index], actual[index]);
        }
        else
        {
            Assert.Equal(expected.ToString(), actual.ToString());
        }
    }

    private static IConfiguration CreateConfiguration() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["CompaniesHouse:ApiKey"] = "test-api-key"
            })
            .Build();

    private static IHttpClientFactory CreateHttpClientFactory(
        HttpStatusCode statusCode,
        string content,
        Action<HttpRequestMessage>? requestObserver = null)
    {
        var handler = new MockHttpMessageHandler(statusCode, content, requestObserver);
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

    private sealed class MockHttpMessageHandler(
        HttpStatusCode statusCode,
        string content,
        Action<HttpRequestMessage>? requestObserver) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }
        public Uri? LastRequestUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            requestObserver?.Invoke(request);
            RequestCount++;
            LastRequestUri = request.RequestUri;
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
