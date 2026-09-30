using System.Net;
using System.Text.Json;
using Api.Database;
using Api.Endpoints;
using Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Api.Tests;

public class CompanyFilterMetadataTests
{
    [Fact]
    public async Task GetFilters_ReturnsBindingNamesWithoutResolvingExternalServices()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Services.AddSingleton<ICompanySearchService>(_ => throw new InvalidOperationException("Unexpected upstream access"));
        builder.Services.AddSingleton<ICompanyDatabaseService>(_ => throw new InvalidOperationException("Unexpected database access"));
        await using var app = builder.Build();
        app.MapCompanyEndpoints();
        app.Urls.Add("http://127.0.0.1:0");
        await app.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };

        using var response = await client.GetAsync("/search/filters");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(new[] { "companyStatuses", "companyTypes", "countries" },
            root.EnumerateObject().Select(property => property.Name).OrderBy(name => name));
        Assert.Equal(Enum.GetNames<CompanyStatusFilter>(), ReadOptions(root, "companyStatuses"));
        Assert.Equal(Enum.GetNames<CompanyTypeFilter>(), ReadOptions(root, "companyTypes"));
        Assert.Equal(Enum.GetNames<RegisteredOfficeCountryFilter>(), ReadOptions(root, "countries"));
        Assert.Contains("LimitedLiabilityPartnership", ReadOptions(root, "companyTypes"));
        Assert.DoesNotContain("llp", ReadOptions(root, "companyTypes"));
    }

    private static string[] ReadOptions(JsonElement root, string property)
    {
        var values = root.GetProperty(property).EnumerateArray().Select(value => value.GetString()!).ToArray();
        Assert.All(values, value => Assert.False(string.IsNullOrWhiteSpace(value)));
        Assert.Equal(values.Length, values.Distinct().Count());
        return values;
    }
}