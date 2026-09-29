using System.Reflection;
using System.Runtime.Serialization;
using System.Text.Json.Serialization;

/// <summary>Filter options accepted by the company search endpoints.</summary>
public sealed record CompanySearchFilters
{
    public IReadOnlyList<CompanyStatusFilter> CompanyStatuses { get; init; } = [];

    public IReadOnlyList<CompanyTypeFilter> CompanyTypes { get; init; } = [];

    public string? Location { get; init; }

    public bool HasFilters => CompanyStatuses.Count > 0
        || CompanyTypes.Count > 0
        || !string.IsNullOrWhiteSpace(Location);
}

/// <summary>Companies House company status values available as search filters.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CompanyStatusFilter
{
    [EnumMember(Value = "active")]
    Active,
    [EnumMember(Value = "dissolved")]
    Dissolved,
    [EnumMember(Value = "open")]
    Open,
    [EnumMember(Value = "closed")]
    Closed,
    [EnumMember(Value = "converted-closed")]
    ConvertedClosed,
    [EnumMember(Value = "receivership")]
    Receivership,
    [EnumMember(Value = "administration")]
    Administration,
    [EnumMember(Value = "liquidation")]
    Liquidation,
    [EnumMember(Value = "insolvency-proceedings")]
    InsolvencyProceedings,
    [EnumMember(Value = "voluntary-arrangement")]
    VoluntaryArrangement,
    [EnumMember(Value = "registered")]
    Registered,
    [EnumMember(Value = "removed")]
    Removed
}

/// <summary>Companies House company type values available as search filters.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CompanyTypeFilter
{
    [EnumMember(Value = "private-unlimited")]
    PrivateUnlimited,
    [EnumMember(Value = "ltd")]
    Ltd,
    [EnumMember(Value = "plc")]
    Plc,
    [EnumMember(Value = "old-public-company")]
    OldPublicCompany,
    [EnumMember(Value = "private-limited-guarant-nsc-limited-exemption")]
    PrivateLimitedGuarantorNscLimitedExemption,
    [EnumMember(Value = "limited-partnership")]
    LimitedPartnership,
    [EnumMember(Value = "private-limited-guarant-nsc")]
    PrivateLimitedGuarantorNsc,
    [EnumMember(Value = "converted-or-closed")]
    ConvertedOrClosed,
    [EnumMember(Value = "private-unlimited-nsc")]
    PrivateUnlimitedNsc,
    [EnumMember(Value = "private-limited-shares-section-30-exemption")]
    PrivateLimitedSharesSection30Exemption,
    [EnumMember(Value = "protected-cell-company")]
    ProtectedCellCompany,
    [EnumMember(Value = "assurance-company")]
    AssuranceCompany,
    [EnumMember(Value = "oversea-company")]
    OverseaCompany,
    [EnumMember(Value = "eeig")]
    Eeig,
    [EnumMember(Value = "icvc-securities")]
    IcvcSecurities,
    [EnumMember(Value = "icvc-warrant")]
    IcvcWarrant,
    [EnumMember(Value = "icvc-umbrella")]
    IcvcUmbrella,
    [EnumMember(Value = "registered-society-non-jurisdictional")]
    RegisteredSocietyNonJurisdictional,
    [EnumMember(Value = "industrial-and-provident-society")]
    IndustrialAndProvidentSociety,
    [EnumMember(Value = "northern-ireland")]
    NorthernIreland,
    [EnumMember(Value = "northern-ireland-other")]
    NorthernIrelandOther,
    [EnumMember(Value = "royal-charter")]
    RoyalCharter,
    [EnumMember(Value = "investment-company-with-variable-capital")]
    InvestmentCompanyWithVariableCapital,
    [EnumMember(Value = "unregistered-company")]
    UnregisteredCompany,
    [EnumMember(Value = "llp")]
    LimitedLiabilityPartnership,
    [EnumMember(Value = "other")]
    Other,
    [EnumMember(Value = "european-public-limited-liability-company-se")]
    EuropeanPublicLimitedLiabilityCompanySe,
    [EnumMember(Value = "uk-establishment")]
    UkEstablishment,
    [EnumMember(Value = "scottish-partnership")]
    ScottishPartnership
}

public static class CompanySearchFilterValues
{
    public static string ToCompaniesHouseValue(this Enum value)
    {
        var member = value.GetType().GetField(value.ToString());
        return member?.GetCustomAttribute<EnumMemberAttribute>()?.Value
            ?? throw new ArgumentOutOfRangeException(nameof(value), value, "Unsupported company search filter value.");
    }
}