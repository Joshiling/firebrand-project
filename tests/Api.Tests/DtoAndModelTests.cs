using System.Text.Json;
using Api.DTOs.CompaniesHouse;
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
}
