using Api.DTOs.CompaniesHouse;

namespace Api.Models;

/// <summary>Represents the full company profile returned by the API.</summary>
public sealed record Company
{
    public AccountsDto? Accounts { get; init; }

    public bool? CanFile { get; init; }

    public required string Name { get; init; }

    public required string RegistryId { get; init; }

    public string CompanyNumber => RegistryId;

    public string? Address { get; init; }

    public string? CompanyStatus { get; init; }

    public string? CompanyType { get; init; }

    public ConfirmationStatementDto? ConfirmationStatement { get; init; }

    public DateOnly? DateOfCreation { get; init; }

    public string? Etag { get; init; }

    public bool? HasCharges { get; init; }

    public bool? HasInsolvencyHistory { get; init; }

    public bool? HasSuperSecurePscs { get; init; }

    public string? Jurisdiction { get; init; }

    public DateOnly? LastFullMembersListDate { get; init; }

    public IReadOnlyDictionary<string, string>? Links { get; init; }

    public IReadOnlyList<PreviousCompanyNameDto>? PreviousCompanyNames { get; init; }

    public RegisteredOfficeAddressDto? RegisteredOfficeAddress { get; init; }

    public bool? RegisteredOfficeIsInDispute { get; init; }

    public IReadOnlyList<string>? SicCodes { get; init; }

    public bool? UndeliverableRegisteredOfficeAddress { get; init; }
}