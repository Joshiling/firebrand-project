public interface ICompanySearchService
{
    Task<IReadOnlyList<Company>> SearchAsync(
        string searchTerm,
        CancellationToken cancellationToken);
}