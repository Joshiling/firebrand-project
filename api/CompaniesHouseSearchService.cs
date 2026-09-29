using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Api.Database;
using Api.DTOs.CompaniesHouse;

public sealed class CompaniesHouseSearchService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ICompanyDatabaseService databaseService) : ICompanySearchService
{
    private const int ItemsPerPage = 100;
    private const string HttpClientName = "CompaniesHouse";
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly ConcurrentDictionary<string, Company> _companies = new(StringComparer.OrdinalIgnoreCase);

    public async Task<IReadOnlyList<CompanySearch>> SearchAsync(
        string searchTerm,
        CancellationToken cancellationToken)
    {
        var apiKey = GetApiKey();
        var companies = new List<CompanySearch>();
        var dbRecords = new List<CompanyDbRecord>();
        var seenRegistryIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var client = httpClientFactory.CreateClient(HttpClientName);
        var path = $"search/companies?q={Uri.EscapeDataString(searchTerm)}&items_per_page={ItemsPerPage}&start_index=0";

        try
        {
            var (page, rawJson) = await GetJsonWithRawAsync<CompanySearchResponseDto>(client, path, apiKey, cancellationToken);

            // Companies House limits how far callers can page into broad searches. Returning the first
            // 100 matches keeps this MVP responsive and avoids a 416 response for names such as Lloyds.
            foreach (var item in page.Items ?? [])
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
                searchTerm,
                StatusCodes.Status200OK,
                page.TotalResults ?? companies.Count,
                rawJson,
                dbRecords,
                cancellationToken);

            return companies;
        }
        catch (CompaniesHouseApiException exception)
        {
            await databaseService.SaveSearchLogAsync(
                searchTerm,
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

        await databaseService.SaveSearchLogAsync(
            registryId,
            StatusCodes.Status200OK,
            1,
            rawJson,
            new[] { dbRecord },
            cancellationToken);

        return company;
    }

    private async Task<(T Value, string RawJson)> GetJsonWithRawAsync<T>(
        HttpClient client,
        string path,
        string apiKey,
        CancellationToken cancellationToken)
    {
        using var response = await SendAsync(client, path, apiKey, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw CreateApiException(response.StatusCode);
        }

        var rawJson = await response.Content.ReadAsStringAsync(cancellationToken);
        var result = JsonSerializer.Deserialize<T>(rawJson, JsonOptions);

        return (result ?? throw new CompaniesHouseApiException(
            "Companies House returned an empty search response.",
            StatusCodes.Status502BadGateway), rawJson);
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
        var responseStatus = statusCode == HttpStatusCode.TooManyRequests
            ? StatusCodes.Status503ServiceUnavailable
            : StatusCodes.Status502BadGateway;

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