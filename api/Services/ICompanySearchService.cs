using Api.Models;

namespace Api.Services;

public interface ICompanySearchService
{
    Task<IReadOnlyList<CompanySearch>> SearchAsync(
        string searchTerm,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<CompanySearch>> SearchByNameAsync(
        string searchTerm,
        CompanySearchFilters? filters,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<CompanySearch>> SearchByRegistryIdAsync(
        string registryId,
        CompanySearchFilters? filters,
        CancellationToken cancellationToken);

    Task<Company?> GetByRegistryIdAsync(
        string registryId,
        CancellationToken cancellationToken);
}