using Api.Database;
using Api.Exceptions;
using Api.Models;
using Api.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Api.Endpoints;

public static class CompanyEndpoints
{
    public static WebApplication MapCompanyEndpoints(this WebApplication app)
    {
        app.MapGet("/registry_id", SearchByRegistryId)
            .WithName("SearchCompaniesByRegistryId")
            .WithSummary("Search companies by registry ID")
            .Produces<IReadOnlyList<CompanySearch>>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces<ProblemDetails>(StatusCodes.Status502BadGateway)
            .Produces<ProblemDetails>(StatusCodes.Status503ServiceUnavailable);

        app.MapGet("/name", SearchByName)
            .WithName("SearchCompaniesByName")
            .WithSummary("Search companies by name")
            .Produces<IReadOnlyList<CompanySearch>>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces<ProblemDetails>(StatusCodes.Status502BadGateway)
            .Produces<ProblemDetails>(StatusCodes.Status503ServiceUnavailable);

        app.MapGet("/registry_id/{id}", GetByRegistryId)
            .WithName("GetCompanyByRegistryId")
            .WithSummary("Get company details by registry ID")
            .Produces<Company>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces<ProblemDetails>(StatusCodes.Status502BadGateway)
            .Produces<ProblemDetails>(StatusCodes.Status503ServiceUnavailable);

        app.MapGet("/registry_id/{id}/history", GetHistoryByRegistryId)
            .WithName("GetCompanyHistoryByRegistryId")
            .WithSummary("Get company version history by registry ID")
            .Produces<IReadOnlyList<CompanyHistoryRecord>>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        return app;
    }

    private static async Task<Results<Ok<IReadOnlyList<CompanyHistoryRecord>>, NotFound, BadRequest<ProblemDetails>>> GetHistoryByRegistryId(
        string id,
        ICompanyDatabaseService databaseService,
        CancellationToken cancellationToken)
    {
        if (!IsValidRegistryId(id))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The registry ID must contain digits, optionally preceded by two letters."));
        }

        var history = await databaseService.GetCompanyHistoryAsync(id, cancellationToken);
        return history.Count == 0 ? TypedResults.NotFound() : TypedResults.Ok(history);
    }

    private static async Task<Results<Ok<IReadOnlyList<CompanySearch>>, BadRequest<ProblemDetails>, ProblemHttpResult>> SearchByRegistryId(
        [FromQuery(Name = "registry_id")] string? registryId,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        if (!IsValidRegistryId(registryId))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The registry_id query parameter must contain digits, optionally preceded by two letters."));
        }

        return await SearchAsync(registryId!, companySearchService, cancellationToken);
    }

    private static async Task<Results<Ok<IReadOnlyList<CompanySearch>>, BadRequest<ProblemDetails>, ProblemHttpResult>> SearchByName(
        [FromQuery(Name = "name")] string? name,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The name query parameter is required."));
        }

        return await SearchAsync(name.Trim(), companySearchService, cancellationToken);
    }

    private static async Task<Results<Ok<Company>, NotFound, BadRequest<ProblemDetails>, ProblemHttpResult>> GetByRegistryId(
        string id,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        if (!IsValidRegistryId(id))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The registry ID must contain digits, optionally preceded by two letters."));
        }

        try
        {
            var company = await companySearchService.GetByRegistryIdAsync(id, cancellationToken);
            return company is null ? TypedResults.NotFound() : TypedResults.Ok(company);
        }
        catch (CompaniesHouseApiException exception)
        {
            return CreateApiProblem(exception);
        }
    }

    private static async Task<Results<Ok<IReadOnlyList<CompanySearch>>, BadRequest<ProblemDetails>, ProblemHttpResult>> SearchAsync(
        string searchTerm,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        try
        {
            var companies = await companySearchService.SearchAsync(searchTerm, cancellationToken);
            return TypedResults.Ok(companies);
        }
        catch (CompaniesHouseApiException exception)
        {
            return CreateApiProblem(exception);
        }
    }

    private static ProblemHttpResult CreateApiProblem(CompaniesHouseApiException exception) =>
        TypedResults.Problem(
            title: "Company lookup failed",
            detail: exception.Message,
            statusCode: exception.StatusCode);

    private static bool IsValidRegistryId(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }

        var digitStart = value.Length >= 2
            && char.IsAsciiLetter(value[0])
            && char.IsAsciiLetter(value[1])
                ? 2
                : 0;

        return digitStart < value.Length
            && value.AsSpan(digitStart).IndexOfAnyExceptInRange('0', '9') < 0;
    }

    private static ProblemDetails CreateValidationProblem(string detail) => new()
    {
        Title = "Invalid request",
        Detail = detail,
        Status = StatusCodes.Status400BadRequest
    };
}