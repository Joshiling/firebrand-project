using Api.Models;

namespace Api.Services;

public interface ICompanySearchService
{
    Task<IReadOnlyList<CompanySearch>> SearchAsync(
        string searchTerm,
        CancellationToken cancellationToken);

    Task<Company?> GetByRegistryIdAsync(
        string registryId,
        CancellationToken cancellationToken);
}