using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Api.DTOs.CompaniesHouse;
using Api.Exceptions;
using Api.Models;

namespace Api.Services;

public sealed class CompaniesHouseSearchService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration) : ICompanySearchService
{
    private const int ItemsPerPage = 100;
    private const string HttpClientName = "CompaniesHouse";

    private readonly ConcurrentDictionary<string, Company> _companies = new(StringComparer.OrdinalIgnoreCase);

    public async Task<IReadOnlyList<CompanySearch>> SearchAsync(
        string searchTerm,
        CancellationToken cancellationToken)
    {
        var apiKey = GetApiKey();
        var companies = new List<CompanySearch>();
        var seenRegistryIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var client = httpClientFactory.CreateClient(HttpClientName);
        var path = $"search/companies?q={Uri.EscapeDataString(searchTerm)}&items_per_page={ItemsPerPage}&start_index=0";
        var page = await GetJsonAsync<CompanySearchResponseDto>(client, path, apiKey, cancellationToken);

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
            companies.Add(ToCompanySearch(company));
        }

        return companies;
    }

    public async Task<Company?> GetByRegistryIdAsync(
        string registryId,
        CancellationToken cancellationToken)
    {
        if (_companies.TryGetValue(registryId, out var cachedCompany))
        {
            return cachedCompany;
        }

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
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw CreateApiException(response.StatusCode);
        }

        var profile = await response.Content.ReadFromJsonAsync<CompanyProfileDto>(
            cancellationToken: cancellationToken);

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
        return company;
    }

    private async Task<T> GetJsonAsync<T>(
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

        var result = await response.Content.ReadFromJsonAsync<T>(
            cancellationToken: cancellationToken);

        return result ?? throw new CompaniesHouseApiException(
            "Companies House returned an empty search response.",
            StatusCodes.Status502BadGateway);
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