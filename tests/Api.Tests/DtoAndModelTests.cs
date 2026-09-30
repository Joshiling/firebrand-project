using System.Text.Json;
using Api.DTOs.CompaniesHouse;
using Api.Database;
using Api.Models;

namespace Api.Tests;

public sealed class DtoAndModelTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public void CompanySearchResponseDto_DeserializesExternalRegistrationNumber()
    {
        // Arrange (from sample_api_response.txt)
        const string json = """
            {
              "items": [
                {
                  "company_number": "FC036349",
                  "company_status": "active",
                  "company_type": "oversea-company",
                  "date_of_creation": "2019-06-03",
                  "external_registration_number": "348563",
                  "title": "VOICESAGE GLOBAL HOLDINGS"
                }
              ],
              "total_results": 1
            }
            """;

        // Act
        var dto = JsonSerializer.Deserialize<CompanySearchResponseDto>(json, JsonOptions);

        // Assert
        Assert.NotNull(dto);
        Assert.Equal(1, dto.TotalResults);
        var item = Assert.Single(dto.Items!);
        Assert.Equal("FC036349", item.CompanyNumber);
        Assert.Equal("348563", item.ExternalRegistrationNumber);
        Assert.Equal("VOICESAGE GLOBAL HOLDINGS", item.Title);
        Assert.Equal("oversea-company", item.CompanyType);
        Assert.Equal(new DateOnly(2019, 6, 3), item.DateOfCreation);
    }

    [Fact]
    public void AdvancedCompanySearchResponseDto_DeserializesAdvancedSearchItems()
    {
        const string json = """
            {
              "items": [
                {
                  "company_name": "LLOYDS BANK PLC",
                  "company_number": "00002065",
                  "company_status": "active",
                  "company_type": "plc",
                  "date_of_creation": "1865-04-20",
                  "registered_office_address": {
                    "address_line_1": "25 Gresham Street",
                    "locality": "London",
                    "country": "United Kingdom"
                  }
                }
              ],
              "total_results": 1
            }
            """;

        var response = JsonSerializer.Deserialize<AdvancedCompanySearchResponseDto>(json, JsonOptions);

        Assert.NotNull(response);
        Assert.Equal(1, response.TotalResults);
        var item = Assert.Single(response.Items!);
        Assert.Equal("LLOYDS BANK PLC", item.CompanyName);
        Assert.Equal("00002065", item.CompanyNumber);
        Assert.Equal("active", item.CompanyStatus);
        Assert.Equal("plc", item.CompanyType);
        Assert.Equal(new DateOnly(1865, 4, 20), item.DateOfCreation);
        Assert.Equal("United Kingdom", item.RegisteredOfficeAddress?.Country);
    }

    [Fact]
    public void CompanyProfileDto_DeserializesExternalRegistrationNumberAndForeignDetails()
    {
        // Arrange
        const string json = """
            {
              "company_name": "OVERSEAS CORP",
              "company_number": "FC012345",
              "external_registration_number": "FOR-999",
              "foreign_company_details": {
                "registration_number": "REG-888"
              }
            }
            """;

        // Act
        var dto = JsonSerializer.Deserialize<CompanyProfileDto>(json, JsonOptions);

        // Assert
        Assert.NotNull(dto);
        Assert.Equal("FC012345", dto.CompanyNumber);
        Assert.Equal("FOR-999", dto.ExternalRegistrationNumber);
        Assert.Equal("REG-888", dto.ForeignCompanyDetails?.RegistrationNumber);
    }

    [Fact]
    public void Company_CompanyNumber_AliasesRegistryId()
    {
        // Arrange & Act
        var company = new Company
        {
            Name = "TEST COMPANY",
            RegistryId = "00002065"
        };

        // Assert
        Assert.Equal("00002065", company.CompanyNumber);
        Assert.Equal("00002065", company.RegistryId);
    }

    [Fact]
    public void CompanySearch_CompanyNumber_AliasesRegistryId()
    {
        // Arrange & Act
        var companySearch = new CompanySearch
        {
            Name = "TEST COMPANY",
            RegistryId = "00002065"
        };

        // Assert
        Assert.Equal("00002065", companySearch.CompanyNumber);
        Assert.Equal("00002065", companySearch.RegistryId);
    }

      [Fact]
      public void CompanySearchFilterEnums_MapToCompaniesHouseCodes()
      {
        Assert.Equal("active", CompanyStatusFilter.Active.ToCompaniesHouseValue());
        Assert.Equal("voluntary-arrangement", CompanyStatusFilter.VoluntaryArrangement.ToCompaniesHouseValue());
        Assert.Equal("ltd", CompanyTypeFilter.Ltd.ToCompaniesHouseValue());
        Assert.Equal("private-limited-shares-section-30-exemption", CompanyTypeFilter.PrivateLimitedSharesSection30Exemption.ToCompaniesHouseValue());
      }

      [Fact]
      public void CompanySearchFilterEnums_RejectUndefinedNumericValues()
      {
        Assert.False(Enum.IsDefined((CompanyStatusFilter)int.MaxValue));
        Assert.False(Enum.IsDefined((CompanyTypeFilter)int.MaxValue));
        }

        [Fact]
      public void VersionHistoryModels_SerializeUsingContractFieldNames()
      {
        var company = new Company
        {
          Name = "LLOYDS BANK PLC",
          RegistryId = "00002065",
          VersionCount = 2
        };
        var history = new CompanyHistoryRecord
        {
          VersionNumber = 2,
          RecordedAt = "2026-09-29T10:30:00Z",
          CompanyNumber = "00002065",
          CompanyName = "LLOYDS BANK PLC"
        };

        var companyJson = JsonSerializer.Serialize(company);
        var historyJson = JsonSerializer.Serialize(history);

        Assert.Contains("\"version_count\":2", companyJson);
        Assert.Contains("\"version_number\":2", historyJson);
        Assert.Contains("\"recorded_at\":", historyJson);
        Assert.Contains("\"company_number\":", historyJson);
        Assert.Contains("\"company_name\":", historyJson);
      }
}
