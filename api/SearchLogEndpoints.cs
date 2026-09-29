using Api.Database;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

public static class SearchLogEndpoints
{
    public static WebApplication MapSearchLogEndpoints(this WebApplication app)
    {
        app.MapGet("/search_logs", GetSearchLogs)
            .WithName("GetSearchLogs")
            .WithSummary("Get paginated company search logs")
            .Produces<SearchLogPage>(StatusCodes.Status200OK)
            .Produces<ProblemDetails>(StatusCodes.Status400BadRequest);

        return app;
    }

    private static async Task<Results<Ok<SearchLogPage>, BadRequest<ProblemDetails>>> GetSearchLogs(
        ICompanyDatabaseService databaseService,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? query = null)
    {
        if (page < 1 || pageSize is < 1 or > 100 || query?.Trim().Length > 100)
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Invalid request",
                Detail = "Page must be at least 1, pageSize must be between 1 and 100, and query must not exceed 100 characters.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var result = await databaseService.GetSearchLogsAsync(page, pageSize, query, cancellationToken);
        return TypedResults.Ok(result);
    }
}