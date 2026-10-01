using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Api.Database;
using Api.DTOs.CompaniesHouse;
using Api.Exceptions;
using Api.Models;

namespace Api.Services;

public sealed class CompaniesHouseSearchService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ICompanyDatabaseService databaseService) : ICompanySearchService
{
    private const int ItemsPerPage = 100;
    private const string HttpClientName = "CompaniesHouse";
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly ConcurrentDictionary<string, Company> _companies = new(StringComparer.OrdinalIgnoreCase);

    public Task<IReadOnlyList<CompanySearch>> SearchAsync(
        string searchTerm,
        CancellationToken cancellationToken) => SearchByNameAsync(searchTerm, null, cancellationToken);

    public Task<IReadOnlyList<CompanySearch>> SearchByNameAsync(
        string searchTerm,
        CompanySearchFilters? filters,
        CancellationToken cancellationToken) =>
        SearchAsyncCore(searchTerm, filters, useAdvancedSearch: filters?.HasFilters == true, cancellationToken);

    public Task<IReadOnlyList<CompanySearch>> SearchByRegistryIdAsync(
        string registryId,
        CompanySearchFilters? filters,
        CancellationToken cancellationToken) =>
        SearchAsyncCore(registryId, filters, useAdvancedSearch: false, cancellationToken);

    private async Task<IReadOnlyList<CompanySearch>> SearchAsyncCore(
        string searchTerm,
        CompanySearchFilters? filters,
        bool useAdvancedSearch,
        CancellationToken cancellationToken)
    {
        var apiKey = GetApiKey();
        var companies = new List<CompanySearch>();
        var dbRecords = new List<CompanyDbRecord>();
        var seenRegistryIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var client = httpClientFactory.CreateClient(HttpClientName);
        var path = useAdvancedSearch
            ? BuildAdvancedSearchPath(searchTerm, filters!)
            : $"search/companies?q={Uri.EscapeDataString(searchTerm)}&items_per_page={ItemsPerPage}&start_index=0";

        try
        {
            CompanySearchResponseDto page;
            string rawJson;
            if (useAdvancedSearch)
            {
                var (advancedPage, responseJson) = await GetJsonWithRawAsync<AdvancedCompanySearchResponseDto>(
                    client,
                    path,
                    apiKey,
                    cancellationToken,
                    () => new AdvancedCompanySearchResponseDto());
                page = ToCompanySearchResponse(advancedPage);
                rawJson = responseJson;
            }
            else
            {
                (page, rawJson) = await GetJsonWithRawAsync<CompanySearchResponseDto>(client, path, apiKey, cancellationToken);
            }

            // Companies House limits how far callers can page into broad searches. Returning the first
            // 100 matches keeps this MVP responsive and avoids a 416 response for names such as Lloyds.
            // Put matches in the current company name ahead of matches found through an old name.
            // OrderByDescending puts the highest relevance score first. ThenBy keeps the original
            // Companies House order when two companies have the same relevance score.
            foreach (var item in (page.Items ?? [])
                .Select((item, index) => new { Item = item, Index = index })
                .OrderByDescending(result => GetSearchRelevance(result.Item.Title, searchTerm))
                .ThenBy(result => result.Index)
                .Select(result => result.Item))
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (string.IsNullOrWhiteSpace(item.CompanyNumber)
                    || !seenRegistryIds.Add(item.CompanyNumber))
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(item.Title))
                {
                    continue;
                }

                if (!MatchesFilters(item, filters))
                {
                    continue;
                }

                var company = ToCompany(item);
                _companies.TryAdd(company.RegistryId, company);
                companies.Add(ToCompanySearch(company));

                dbRecords.Add(new CompanyDbRecord
                {
                    CompanyNumber = item.CompanyNumber,
                    CompanyName = item.Title,
                    CompanyStatus = item.CompanyStatus,
                    IncorporationDate = item.DateOfCreation?.ToString("yyyy-MM-dd"),
                    Address = FormatAddress(item.Address) ?? item.AddressSnippet,
                    ExternalRegistrationNumber = item.ExternalRegistrationNumber
                });
            }

            await databaseService.SaveSearchLogAsync(
                FormatSearchLogInput(searchTerm, filters),
                StatusCodes.Status200OK,
                filters?.HasFilters == true && !useAdvancedSearch
                    ? companies.Count
                    : page.TotalResults ?? companies.Count,
                rawJson,
                dbRecords,
                cancellationToken);

            return companies;
        }
        catch (CompaniesHouseApiException exception)
        {
            await databaseService.SaveSearchLogAsync(
                FormatSearchLogInput(searchTerm, filters),
                exception.StatusCode,
                0,
                exception.Message,
                Array.Empty<CompanyDbRecord>(),
                cancellationToken);

            throw;
        }
    }

    public async Task<Company?> GetByRegistryIdAsync(
        string registryId,
        CancellationToken cancellationToken)
    {
        var apiKey = GetApiKey();
        var client = httpClientFactory.CreateClient(HttpClientName);
        return await GetCompanyProfileAsync(
            client,
            registryId,
            apiKey,
            fallbackName: null,
            fallbackAddress: null,
            cancellationToken);
    }

    private string GetApiKey()
    {
        var apiKey = configuration["CompaniesHouse:ApiKey"];

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new CompaniesHouseApiException(
                "The Companies House API key is not configured.",
                StatusCodes.Status503ServiceUnavailable);
        }

        return apiKey;
    }

    private async Task<Company?> GetCompanyProfileAsync(
        HttpClient client,
        string registryId,
        string apiKey,
        string? fallbackName,
        string? fallbackAddress,
        CancellationToken cancellationToken)
    {
        using var response = await SendAsync(
            client,
            $"company/{Uri.EscapeDataString(registryId)}",
            apiKey,
            cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            await databaseService.SaveSearchLogAsync(
                registryId,
                StatusCodes.Status404NotFound,
                0,
                null,
                Array.Empty<CompanyDbRecord>(),
                cancellationToken);
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            var exception = CreateApiException(response.StatusCode);
            await databaseService.SaveSearchLogAsync(
                registryId,
                exception.StatusCode,
                0,
                response.ReasonPhrase,
                Array.Empty<CompanyDbRecord>(),
                cancellationToken);
            throw exception;
        }

        var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
        var profile = JsonSerializer.Deserialize<CompanyProfileDto>(rawJson, JsonOptions);

        if (profile is null)
        {
            throw new CompaniesHouseApiException(
                "Companies House returned an empty company profile.",
                StatusCodes.Status502BadGateway);
        }

        var companyName = profile.CompanyName ?? fallbackName;
        var companyNumber = profile.CompanyNumber ?? registryId;

        if (string.IsNullOrWhiteSpace(companyName))
        {
            return null;
        }

        var company = new Company
        {
            Accounts = profile.Accounts,
            CanFile = profile.CanFile,
            Name = companyName,
            RegistryId = companyNumber,
            Address = FormatAddress(profile.RegisteredOfficeAddress) ?? fallbackAddress,
            CompanyStatus = profile.CompanyStatus,
            CompanyType = profile.CompanyType,
            ConfirmationStatement = profile.ConfirmationStatement,
            DateOfCreation = profile.DateOfCreation,
            Etag = profile.Etag,
            HasCharges = profile.HasCharges,
            HasInsolvencyHistory = profile.HasInsolvencyHistory,
            HasSuperSecurePscs = profile.HasSuperSecurePscs,
            Jurisdiction = profile.Jurisdiction,
            LastFullMembersListDate = profile.LastFullMembersListDate,
            Links = profile.Links,
            PreviousCompanyNames = profile.PreviousCompanyNames,
            RegisteredOfficeAddress = profile.RegisteredOfficeAddress,
            RegisteredOfficeIsInDispute = profile.RegisteredOfficeIsInDispute,
            SicCodes = profile.SicCodes,
            UndeliverableRegisteredOfficeAddress = profile.UndeliverableRegisteredOfficeAddress
        };

        _companies[company.RegistryId] = company;

        var dbRecord = new CompanyDbRecord
        {
            CompanyNumber = companyNumber,
            CompanyName = companyName,
            CompanyStatus = profile.CompanyStatus,
            IncorporationDate = profile.DateOfCreation?.ToString("yyyy-MM-dd"),
            Address = company.Address,
            ExternalRegistrationNumber = profile.ExternalRegistrationNumber ?? profile.ForeignCompanyDetails?.RegistrationNumber
        };

        var version = await databaseService.SaveCompanyProfileWithVersionAsync(
            registryId,
            StatusCodes.Status200OK,
            rawJson,
            dbRecord,
            cancellationToken);

        return company with { VersionCount = version.TotalVersions };
    }

    private async Task<(T Value, string RawJson)> GetJsonWithRawAsync<T>(
        HttpClient client,
        string path,
        string apiKey,
        CancellationToken cancellationToken,
        Func<T>? notFoundFactory = null)
    {
        using var response = await SendAsync(client, path, apiKey, cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound && notFoundFactory is not null)
        {
            return (notFoundFactory(), string.Empty);
        }

        if (!response.IsSuccessStatusCode)
        {
            throw CreateApiException(response.StatusCode);
        }

        var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
        T? result;
        try
        {
            result = JsonSerializer.Deserialize<T>(rawJson, JsonOptions);
        }
        catch (JsonException exception)
        {
            throw new CompaniesHouseApiException(
                $"Companies House returned malformed data: {exception.Message}",
                StatusCodes.Status502BadGateway);
        }

        return (result ?? throw new CompaniesHouseApiException(
            "Companies House returned an empty search response.",
            StatusCodes.Status502BadGateway), rawJson);
    }

    private static string BuildAdvancedSearchPath(string searchTerm, CompanySearchFilters filters)
    {
        var query = new List<KeyValuePair<string, string?>>
        {
            new("company_name_includes", searchTerm),
            new("size", ItemsPerPage.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            new("start_index", "0")
        };

        foreach (var status in filters.CompanyStatuses)
        {
            query.Add(new KeyValuePair<string, string?>("company_status", status.ToCompaniesHouseValue()));
        }

        foreach (var type in filters.CompanyTypes)
        {
            query.Add(new KeyValuePair<string, string?>("company_type", type.ToCompaniesHouseValue()));
        }

        var upstreamLocation = !string.IsNullOrWhiteSpace(filters.City)
            ? filters.City
            : filters.Country?.ToCompaniesHouseValue();
        if (!string.IsNullOrWhiteSpace(upstreamLocation))
        {
            query.Add(new KeyValuePair<string, string?>("location", upstreamLocation));
        }

        return QueryHelpers.AddQueryString("advanced-search/companies", query);
    }

    private static CompanySearchResponseDto ToCompanySearchResponse(AdvancedCompanySearchResponseDto response) => new()
    {
        TotalResults = response.TotalResults,
        Items = response.Items?.Select(item => new CompanySearchItemDto
        {
            Title = item.CompanyName,
            CompanyNumber = item.CompanyNumber,
            CompanyStatus = item.CompanyStatus,
            CompanyType = item.CompanyType,
            DateOfCreation = item.DateOfCreation,
            Address = item.RegisteredOfficeAddress ?? item.Address,
            AddressSnippet = item.AddressSnippet
        }).ToList()
    };

    private static bool MatchesFilters(CompanySearchItemDto item, CompanySearchFilters? filters)
    {
        if (filters is null || !filters.HasFilters)
        {
            return true;
        }

        var matchesStatus = filters.CompanyStatuses.Count == 0
            || filters.CompanyStatuses.Any(status => string.Equals(
                status.ToCompaniesHouseValue(),
                item.CompanyStatus,
                StringComparison.OrdinalIgnoreCase));
        var matchesType = filters.CompanyTypes.Count == 0
            || filters.CompanyTypes.Any(type => string.Equals(
                type.ToCompaniesHouseValue(),
                item.CompanyType,
                StringComparison.OrdinalIgnoreCase));
        var matchesCity = string.IsNullOrWhiteSpace(filters.City)
            || string.Equals(item.Address?.Locality, filters.City, StringComparison.OrdinalIgnoreCase);
        var matchesCountry = !filters.Country.HasValue
            || string.Equals(
                item.Address?.Country,
                filters.Country.Value.ToCompaniesHouseValue(),
                StringComparison.OrdinalIgnoreCase);

        return matchesStatus && matchesType && matchesCity && matchesCountry;
    }

    private static string FormatSearchLogInput(string searchTerm, CompanySearchFilters? filters)
    {
        if (filters is null || !filters.HasFilters)
        {
            return searchTerm;
        }

        var filterParts = new List<string>();
        if (filters.CompanyStatuses.Count > 0)
        {
            filterParts.Add($"company_status={string.Join(',', filters.CompanyStatuses.Select(value => value.ToCompaniesHouseValue()))}");
        }

        if (filters.CompanyTypes.Count > 0)
        {
            filterParts.Add($"company_type={string.Join(',', filters.CompanyTypes.Select(value => value.ToCompaniesHouseValue()))}");
        }

        if (!string.IsNullOrWhiteSpace(filters.City))
        {
            filterParts.Add($"city={filters.City}");
        }

        if (filters.Country.HasValue)
        {
            filterParts.Add($"country={filters.Country.Value.ToCompaniesHouseValue()}");
        }

        return $"{searchTerm} [{string.Join("; ", filterParts)}]";
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        string path,
        string apiKey,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{apiKey}:"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);

        try
        {
            return await client.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new CompaniesHouseApiException(
                $"Companies House request failed: {exception.Message}",
                StatusCodes.Status502BadGateway);
        }
    }

    private static CompaniesHouseApiException CreateApiException(HttpStatusCode statusCode)
    {
        var responseStatus = statusCode switch
        {
            HttpStatusCode.BadRequest => StatusCodes.Status400BadRequest,
            HttpStatusCode.TooManyRequests => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status502BadGateway
        };

        return new CompaniesHouseApiException(
            $"Companies House returned HTTP {(int)statusCode}.",
            responseStatus);
    }

    private static string? FormatAddress(RegisteredOfficeAddressDto? address)
    {
        if (address is null)
        {
            return null;
        }

        var parts = new[]
        {
            address.AddressLine1,
            address.AddressLine2,
            address.Locality,
            address.Region,
            address.PostalCode,
            address.Country
        };

        var formatted = string.Join(", ", parts.Where(part => !string.IsNullOrWhiteSpace(part)));
        return string.IsNullOrWhiteSpace(formatted) ? null : formatted;
    }

    private static int GetSearchRelevance(string? companyName, string searchTerm)
    {
        if (string.IsNullOrWhiteSpace(companyName))
        {
            return 0;
        }

        var normalizedName = companyName.Trim();
        var normalizedTerm = searchTerm.Trim();

        // A higher score means the search term is a stronger match for the current name.
        // 4 = the whole name matches, 3 = the name starts with the search term,
        // 2 = a word starts with it, and 1 = it appears somewhere inside the name.
        if (normalizedName.Equals(normalizedTerm, StringComparison.OrdinalIgnoreCase))
        {
            return 4;
        }

        if (normalizedName.StartsWith(normalizedTerm, StringComparison.OrdinalIgnoreCase))
        {
            return 3;
        }

        var nameWords = normalizedName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (nameWords.Any(word => word.StartsWith(normalizedTerm, StringComparison.OrdinalIgnoreCase)))
        {
            return 2;
        }

        return normalizedName.Contains(normalizedTerm, StringComparison.OrdinalIgnoreCase) ? 1 : 0;
    }

    private static Company ToCompany(CompanySearchItemDto item) => new()
    {
        Name = item.Title!,
        RegistryId = item.CompanyNumber!,
        Address = FormatAddress(item.Address) ?? item.AddressSnippet,
        CompanyStatus = item.CompanyStatus,
        CompanyType = item.CompanyType,
        DateOfCreation = item.DateOfCreation,
        RegisteredOfficeAddress = item.Address
    };

    private static CompanySearch ToCompanySearch(Company company) => new()
    {
        Name = company.Name,
        RegistryId = company.RegistryId,
        Address = company.Address,
        CompanyStatus = company.CompanyStatus,
        CompanyType = company.CompanyType
    };
}