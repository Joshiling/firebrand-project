using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

public static class CompanyEndpoints
{
    public static WebApplication MapCompanyEndpoints(this WebApplication app)
    {
        app.MapGet("/registry_id", SearchByRegistryId)
            .WithName("SearchCompaniesByRegistryId")
            .WithSummary("Search companies by registry ID")
            .Produces<IReadOnlyList<Company>>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status501NotImplemented);

        app.MapGet("/name", SearchByName)
            .WithName("SearchCompaniesByName")
            .WithSummary("Search companies by name")
            .Produces<IReadOnlyList<Company>>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status501NotImplemented);

        app.MapGet("/registry_id/{id}", GetByRegistryId)
            .WithName("GetCompanyByRegistryId")
            .WithSummary("Get company details by registry ID")
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status501NotImplemented);

        return app;
    }

    private static Results<StatusCodeHttpResult, BadRequest<ProblemDetails>> SearchByRegistryId(
        [FromQuery(Name = "registry_id")] string? registryId)
    {
        if (!IsValidRegistryId(registryId))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The registry_id query parameter must contain only digits."));
        }

        return TypedResults.StatusCode(StatusCodes.Status501NotImplemented);
    }

    private static Results<StatusCodeHttpResult, BadRequest<ProblemDetails>> SearchByName(
        [FromQuery(Name = "name")] string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The name query parameter is required."));
        }

        return TypedResults.StatusCode(StatusCodes.Status501NotImplemented);
    }

    private static Results<StatusCodeHttpResult, BadRequest<ProblemDetails>> GetByRegistryId(string id)
    {
        if (!IsValidRegistryId(id))
        {
            return TypedResults.BadRequest(CreateValidationProblem(
                "The registry ID must contain only digits."));
        }

        return TypedResults.StatusCode(StatusCodes.Status501NotImplemented);
    }

    private static bool IsValidRegistryId(string? value) =>
        !string.IsNullOrEmpty(value) && value.All(char.IsAsciiDigit);

    private static ProblemDetails CreateValidationProblem(string detail) => new()
    {
        Title = "Invalid request",
        Detail = detail,
        Status = StatusCodes.Status400BadRequest
    };
}