using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

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

        return app;
    }

    private static async Task<Results<Ok<IReadOnlyList<CompanySearch>>, BadRequest<ProblemDetails>, ProblemHttpResult>> SearchByRegistryId(
        [FromQuery(Name = "registry_id")] string? registryId,
        [FromQuery(Name = "company_status")] CompanyStatusFilter[]? companyStatuses,
        [FromQuery(Name = "company_type")] CompanyTypeFilter[]? companyTypes,
        [FromQuery(Name = "location")] string? location,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        if (!IsValidRegistryId(registryId))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The registry_id query parameter must contain digits, optionally preceded by two letters."));
        }

        var filters = CreateFilters(companyStatuses, companyTypes, location, out var validationError);
        if (filters is null)
        {
            return TypedResults.BadRequest(CreateValidationProblem(validationError!));
        }

        return await SearchAsync(registryId!, filters, isRegistryIdSearch: true, companySearchService, cancellationToken);
    }

    private static async Task<Results<Ok<IReadOnlyList<CompanySearch>>, BadRequest<ProblemDetails>, ProblemHttpResult>> SearchByName(
        [FromQuery(Name = "name")] string? name,
        [FromQuery(Name = "company_status")] CompanyStatusFilter[]? companyStatuses,
        [FromQuery(Name = "company_type")] CompanyTypeFilter[]? companyTypes,
        [FromQuery(Name = "location")] string? location,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The name query parameter is required."));
        }

        var filters = CreateFilters(companyStatuses, companyTypes, location, out var validationError);
        if (filters is null)
        {
            return TypedResults.BadRequest(CreateValidationProblem(validationError!));
        }

        return await SearchAsync(name.Trim(), filters, isRegistryIdSearch: false, companySearchService, cancellationToken);
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
        CompanySearchFilters filters,
        bool isRegistryIdSearch,
        ICompanySearchService companySearchService,
        CancellationToken cancellationToken)
    {
        try
        {
            var companies = isRegistryIdSearch
                ? await companySearchService.SearchByRegistryIdAsync(searchTerm, filters, cancellationToken)
                : await companySearchService.SearchByNameAsync(searchTerm, filters, cancellationToken);
            return TypedResults.Ok(companies);
        }
        catch (CompaniesHouseApiException exception)
        {
            return CreateApiProblem(exception);
        }
    }

    private static CompanySearchFilters? CreateFilters(
        CompanyStatusFilter[]? companyStatuses,
        CompanyTypeFilter[]? companyTypes,
        string? location,
        out string? validationError)
    {
        var normalizedLocation = location?.Trim();

        if ((companyStatuses ?? []).Any(value => !Enum.IsDefined(value)))
        {
            validationError = "Each company_status value must be a supported option.";
            return null;
        }

        if ((companyTypes ?? []).Any(value => !Enum.IsDefined(value)))
        {
            validationError = "Each company_type value must be a supported option.";
            return null;
        }

        if (location is not null && (string.IsNullOrWhiteSpace(normalizedLocation) || normalizedLocation.Length > 100))
        {
            validationError = "The location filter must contain 1 to 100 characters.";
            return null;
        }

        validationError = null;
        return new CompanySearchFilters
        {
            CompanyStatuses = (companyStatuses ?? []).Distinct().ToArray(),
            CompanyTypes = (companyTypes ?? []).Distinct().ToArray(),
            Location = normalizedLocation
        };
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