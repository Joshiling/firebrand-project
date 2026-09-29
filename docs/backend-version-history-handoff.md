# Backend Handoff: Company Version History

## Target Branch
`version-history`

## Overview
Implement version control for company profile data in `database.db`. When a user requests a company's details (`GET /registry_id/{id}`), compare the retrieved company data against the latest stored record.
- If data matches: do not create a new version (optionally touch `LastSeenAt`).
- If data has changed: record a new immutable snapshot in `CompanyHistory` with an incremented `VersionNumber` and update the latest record in `Companies`.
- Existing records in `database.db` must be backfilled to `VersionNumber = 1`.
- Search requests (`/name`, `/registry_id`) continue to update current records without creating version history snapshots.

---

## Architecture & Database Changes

### 1. Schema Migration (`database.db`)

Add `CompanyHistory` table and update `Companies` table via `EnsureSchemaAsync` in `api/Database/CompanyDatabaseService.cs`:

```sql
-- Extend Companies table
ALTER TABLE Companies ADD COLUMN CurrentVersion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Companies ADD COLUMN ContentHash TEXT;
ALTER TABLE Companies ADD COLUMN LastSeenAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- New CompanyHistory table (Immutable Snapshots)
CREATE TABLE IF NOT EXISTS CompanyHistory (
    HistoryId INTEGER PRIMARY KEY AUTOINCREMENT,
    CompanyNumber TEXT NOT NULL,
    VersionNumber INTEGER NOT NULL,
    CompanyName TEXT NOT NULL,
    CompanyStatus TEXT,
    IncorporationDate TEXT,
    Address TEXT,
    ExternalRegistrationNumber TEXT,
    ContentHash TEXT NOT NULL,
    RecordedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    SearchLogId INTEGER,
    FOREIGN KEY (CompanyNumber) REFERENCES Companies(CompanyNumber) ON DELETE CASCADE,
    FOREIGN KEY (SearchLogId) REFERENCES search_logs(SearchLogId),
    UNIQUE (CompanyNumber, VersionNumber)
);

CREATE INDEX IF NOT EXISTS idx_company_history_lookup 
ON CompanyHistory (CompanyNumber, VersionNumber DESC);
```

### 2. Automatic One-Time Backfill Migration
When initializing the database schema, check for any `Companies` records missing `ContentHash` or missing a row in `CompanyHistory`:
- Compute `ContentHash` for existing `Companies`.
- Insert an initial snapshot into `CompanyHistory` with `VersionNumber = 1`, `RecordedAt = CURRENT_TIMESTAMP`.
- Set `Companies.CurrentVersion = 1` and update `Companies.ContentHash`.

### 3. Content Hashing & Change Detection
Create a helper (e.g. `CompanyContentHasher` or method in `CompanyDatabaseService`) to compute a deterministic SHA-256 hash of normalized fields:
```csharp
public static string ComputeContentHash(
    string companyName,
    string? companyStatus,
    string? incorporationDate,
    string? address,
    string? externalRegistrationNumber)
{
    var raw = $"{companyName.Trim().ToUpperInvariant()}|" +
              $"{(companyStatus ?? "").Trim().ToLowerInvariant()}|" +
              $"{(incorporationDate ?? "").Trim()}|" +
              $"{(address ?? "").Trim()}|" +
              $"{(externalRegistrationNumber ?? "").Trim()}";

    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
    return Convert.ToHexString(bytes).ToLowerInvariant();
}
```

---

## Service Layer Changes

### 1. Database Service Interface (`api/Database/ICompanyDatabaseService.cs`)
Add:
```csharp
Task<CompanyVersionResult> SaveCompanyProfileWithVersionAsync(
    string registryId,
    int httpStatus,
    string? rawJson,
    CompanyDbRecord companyRecord,
    CancellationToken cancellationToken = default);

Task<IReadOnlyList<CompanyHistoryRecord>> GetCompanyHistoryAsync(
    string companyNumber,
    CancellationToken cancellationToken = default);
```

### 2. Return Models (`api/Database/`)
```csharp
public sealed record CompanyVersionResult
{
    public required long SearchLogId { get; init; }
    public required int CurrentVersion { get; init; }
    public required int TotalVersions { get; init; }
    public required bool HasChanged { get; init; }
}

public sealed record CompanyHistoryRecord
{
    public required int VersionNumber { get; init; }
    public required string RecordedAt { get; init; }
    public required string CompanyNumber { get; init; }
    public required string CompanyName { get; init; }
    public string? CompanyStatus { get; init; }
    public string? IncorporationDate { get; init; }
    public string? Address { get; init; }
    public string? ExternalRegistrationNumber { get; init; }
}
```

### 3. Detail Lookup Logic (`CompaniesHouseSearchService.cs`)
Inside `GetCompanyProfileAsync(registryId, ...)`:
- Only trigger `SaveCompanyProfileWithVersionAsync` during profile retrieval (strictly when viewing profile).
- Attach `VersionCount` to the returned `Company` model so the caller knows if history exists.

---

## API Endpoints (`api/CompanyEndpoints.cs`)

### 1. Update Existing Detail Endpoint: `GET /registry_id/{id}`
Add `version_count` to the returned `Company` JSON payload:
```json
{
  "company_name": "LLOYDS BANK PLC",
  "company_number": "00002065",
  "company_status": "active",
  "version_count": 3
}
```

### 2. New History Endpoint: `GET /registry_id/{id}/history`
Route:
```http
GET /registry_id/00002065/history
```
Response: `200 OK` (ordered by `version_number DESC`):
```json
[
  {
    "version_number": 3,
    "recorded_at": "2026-09-29T10:30:00Z",
    "company_number": "00002065",
    "company_name": "LLOYDS BANK PLC",
    "company_status": "active",
    "address": "25 Gresham Street, London, EC2V 7HN",
    "incorporation_date": "1865-04-20"
  },
  {
    "version_number": 2,
    "recorded_at": "2025-05-10T14:15:00Z",
    "company_number": "00002065",
    "company_name": "LLOYDS BANK PLC",
    "company_status": "active",
    "address": "71 Lombard Street, London, EC3P 3BS",
    "incorporation_date": "1865-04-20"
  },
  {
    "version_number": 1,
    "recorded_at": "2024-01-15T09:00:00Z",
    "company_number": "00002065",
    "company_name": "LLOYDS BANK LIMITED",
    "company_status": "active",
    "address": "71 Lombard Street, London, EC3P 3BS",
    "incorporation_date": "1865-04-20"
  }
]
```
If no history or company not found: Return `404 Not Found` or `200 OK` with `[]` if company has not been logged yet.

---

## Testing & Verification Checklist
1. **Unit & Integration Tests in `tests/Api.Tests/`**:
   - `FirstProfileLookup_CreatesVersion1InHistoryAndCompanies`: Check `VersionNumber == 1`.
   - `SubsequentIdenticalLookup_DoesNotCreateNewVersion`: Re-querying with identical data leaves `CompanyHistory` count at 1.
   - `DataChange_CreatesVersion2`: Querying same `CompanyNumber` with an altered address creates `VersionNumber == 2`.
   - `GetHistory_ReturnsChronologicalOrder`: Verifies `GET /registry_id/{id}/history` returns newest versions first.
   - `SearchEndpoints_DoNotCreateHistoryVersions`: Verify `/name` searches only update `search_logs` and current records without inserting into `CompanyHistory`.
2. **Build and Test Commands**:
   ```powershell
   dotnet build api/api.csproj
   dotnet test tests/Api.Tests/Api.Tests.csproj
   ```
