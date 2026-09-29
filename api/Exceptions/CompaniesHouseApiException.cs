namespace Api.Exceptions;

public sealed class CompaniesHouseApiException(string message, int statusCode)
    : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}