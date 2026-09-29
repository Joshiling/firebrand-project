using System.Text.Json.Serialization;

namespace Api.DTOs.CompaniesHouse;

// Represents the core company information returned by the Companies House API
// for a company profile response, including registration and status details.
public class CompanyProfileDto
{
    [JsonPropertyName("accounts")]
    public AccountsDto? Accounts { get; set; }

    [JsonPropertyName("can_file")]
    public bool? CanFile { get; set; }

    [JsonPropertyName("company_name")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("company_number")]
    public string? CompanyNumber { get; set; }

    [JsonPropertyName("external_registration_number")]
    public string? ExternalRegistrationNumber { get; set; }

    [JsonPropertyName("foreign_company_details")]
    public ForeignCompanyDetailsDto? ForeignCompanyDetails { get; set; }

    [JsonPropertyName("company_status")]
    public string? CompanyStatus { get; set; }

    [JsonPropertyName("confirmation_statement")]
    public ConfirmationStatementDto? ConfirmationStatement { get; set; }

    [JsonPropertyName("type")]
    public string? CompanyType { get; set; }

    [JsonPropertyName("date_of_creation")]
    public DateOnly? DateOfCreation { get; set; }

    [JsonPropertyName("etag")]
    public string? Etag { get; set; }

    [JsonPropertyName("has_charges")]
    public bool? HasCharges { get; set; }

    [JsonPropertyName("has_insolvency_history")]
    public bool? HasInsolvencyHistory { get; set; }

    [JsonPropertyName("has_super_secure_pscs")]
    public bool? HasSuperSecurePscs { get; set; }

    [JsonPropertyName("jurisdiction")]
    public string? Jurisdiction { get; set; }

    [JsonPropertyName("last_full_members_list_date")]
    public DateOnly? LastFullMembersListDate { get; set; }

    [JsonPropertyName("links")]
    public Dictionary<string, string>? Links { get; set; }

    [JsonPropertyName("previous_company_names")]
    public List<PreviousCompanyNameDto>? PreviousCompanyNames { get; set; }

    [JsonPropertyName("registered_office_address")]
    public RegisteredOfficeAddressDto? RegisteredOfficeAddress { get; set; }

    [JsonPropertyName("registered_office_is_in_dispute")]
    public bool? RegisteredOfficeIsInDispute { get; set; }

    [JsonPropertyName("sic_codes")]
    public List<string>? SicCodes { get; set; }

    [JsonPropertyName("undeliverable_registered_office_address")]
    public bool? UndeliverableRegisteredOfficeAddress { get; set; }
}

public sealed class ForeignCompanyDetailsDto
{
    [JsonPropertyName("registration_number")]
    public string? RegistrationNumber { get; set; }
}

public sealed class AccountsDto
{
    [JsonPropertyName("accounting_reference_date")]
    public AccountingReferenceDateDto? AccountingReferenceDate { get; set; }

    [JsonPropertyName("last_accounts")]
    public LastAccountsDto? LastAccounts { get; set; }

    [JsonPropertyName("next_accounts")]
    public NextAccountsDto? NextAccounts { get; set; }

    [JsonPropertyName("next_due")]
    public DateOnly? NextDue { get; set; }

    [JsonPropertyName("next_made_up_to")]
    public DateOnly? NextMadeUpTo { get; set; }

    [JsonPropertyName("overdue")]
    public bool? Overdue { get; set; }
}

public sealed class AccountingReferenceDateDto
{
    [JsonPropertyName("day")]
    public string? Day { get; set; }

    [JsonPropertyName("month")]
    public string? Month { get; set; }
}

public sealed class LastAccountsDto
{
    [JsonPropertyName("made_up_to")]
    public DateOnly? MadeUpTo { get; set; }

    [JsonPropertyName("period_end_on")]
    public DateOnly? PeriodEndOn { get; set; }

    [JsonPropertyName("period_start_on")]
    public DateOnly? PeriodStartOn { get; set; }

    [JsonPropertyName("type")]
    public string? Type { get; set; }
}

public sealed class NextAccountsDto
{
    [JsonPropertyName("due_on")]
    public DateOnly? DueOn { get; set; }

    [JsonPropertyName("overdue")]
    public bool? Overdue { get; set; }

    [JsonPropertyName("period_end_on")]
    public DateOnly? PeriodEndOn { get; set; }

    [JsonPropertyName("period_start_on")]
    public DateOnly? PeriodStartOn { get; set; }
}

public sealed class ConfirmationStatementDto
{
    [JsonPropertyName("last_made_up_to")]
    public DateOnly? LastMadeUpTo { get; set; }

    [JsonPropertyName("next_due")]
    public DateOnly? NextDue { get; set; }

    [JsonPropertyName("next_made_up_to")]
    public DateOnly? NextMadeUpTo { get; set; }

    [JsonPropertyName("overdue")]
    public bool? Overdue { get; set; }
}

public sealed class PreviousCompanyNameDto
{
    [JsonPropertyName("ceased_on")]
    public DateOnly? CeasedOn { get; set; }

    [JsonPropertyName("effective_from")]
    public DateOnly? EffectiveFrom { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }
}