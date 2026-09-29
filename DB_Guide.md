# Database Guide

This guide describes the SQLite database used by the CompanyLens backend. The schema is created and upgraded by `CompanyDatabaseService.EnsureSchemaAsync`; developers do not need to run a separate migration command.

For a beginner-friendly introduction with examples, read [Database Tables Explained](docs/database-tables-explained.md).

## Schema

![CompanyLens database schema](images/database-schema.png)

The editable Mermaid source is in `images/database-schema.mmd`.

### `Companies`

Stores the latest known data for each Companies House company.

| Column | Type | Rules | Purpose |
| --- | --- | --- | --- |
| `CompanyNumber` | `TEXT` | Primary key | Companies House registration number; leading zeros and prefixes are preserved. |
| `CompanyName` | `TEXT` | Not null | Latest company name. |
| `CompanyStatus` | `TEXT` | Nullable | Latest status. |
| `IncorporationDate` | `TEXT` | Nullable | ISO date returned by Companies House. |
| `Address` | `TEXT` | Nullable | Formatted registered-office address. |
| `ExternalRegistrationNumber` | `TEXT` | Nullable | Registration number for an overseas company. |
| `CurrentVersion` | `INTEGER` | Not null, default `1` | Latest profile version number. |
| `ContentHash` | `TEXT` | Nullable | SHA-256 hash used to detect profile changes. Search-only records can remain unversioned until their first profile view. |
| `LastSeenAt` | `TEXT` | Not null, current timestamp | Last successful profile lookup. |

### `CompanyHistory`

Stores immutable company-profile snapshots. A company has at most one row for each version number.

| Column | Type | Rules | Purpose |
| --- | --- | --- | --- |
| `HistoryId` | `INTEGER` | Primary key, autoincrement | Snapshot identifier. |
| `CompanyNumber` | `TEXT` | Foreign key to `Companies`, cascade delete | Company represented by the snapshot. |
| `VersionNumber` | `INTEGER` | Unique with `CompanyNumber` | Version number beginning at `1`. |
| `CompanyName` | `TEXT` | Not null | Name at the time of the snapshot. |
| `CompanyStatus` | `TEXT` | Nullable | Status at the time of the snapshot. |
| `IncorporationDate` | `TEXT` | Nullable | Incorporation date at the time of the snapshot. |
| `Address` | `TEXT` | Nullable | Address at the time of the snapshot. |
| `ExternalRegistrationNumber` | `TEXT` | Nullable | External registration number at the time of the snapshot. |
| `ContentHash` | `TEXT` | Not null | Normalized snapshot hash. |
| `RecordedAt` | `TEXT` | Not null, current timestamp | Time the version was created. |
| `SearchLogId` | `INTEGER` | Nullable foreign key to `search_logs` | Profile request that created the version; backfilled versions have no request ID. |

The `idx_company_history_lookup` index on `(CompanyNumber, VersionNumber DESC)` supports newest-first history reads.

### `search_logs`

Stores one row for every Companies House search or profile request, including failed and zero-result requests.

| Column | Type | Rules | Purpose |
| --- | --- | --- | --- |
| `SearchLogId` | `INTEGER` | Primary key | Request identifier. |
| `UserInput` | `TEXT` | Not null | Exact submitted name or company number. |
| `SearchedAt` | `TEXT` | Not null, current timestamp | Request time. |
| `ApiResponse` | `TEXT` | Nullable | Raw upstream response retained internally. It is not returned by `/search_logs`. |
| `ResultCount` | `INTEGER` | Nullable | Upstream result count. |
| `HttpStatus` | `INTEGER` | Nullable | Status recorded for the request. |

### `search_log_companies`

Connects searches to returned companies. Its composite primary key is `(SearchLogId, CompanyNumber)`, and both columns are foreign keys. This produces a many-to-many relationship: one search may return many companies, and one company may appear in many searches. A zero-result or failed search still has a `search_logs` row but no links.

### `SchemaMigrations`

Records one-time schema/data migrations. `company-version-history-v1` adds version metadata and backfills every company that existed when the migration first ran as version `1` in `CompanyHistory`.

## Data Flow

![CompanyLens database data flow](images/database-data-flow.png)

The editable Mermaid source is in `images/database-data-flow.mmd`.

### Name and registration-number searches

Requests to `GET /name` and query-form `GET /registry_id` use one transaction:

1. Insert a `search_logs` row and immediately capture its `SearchLogId`.
2. Insert or update each latest company record in `Companies`.
3. Insert each `(SearchLogId, CompanyNumber)` pair into `search_log_companies`.
4. Commit all writes together.

Searches do **not** create `CompanyHistory` snapshots. This prevents partial search-result data from being treated as a complete company profile.

### Company profile views

`GET /registry_id/{id}` uses a version-aware transaction:

1. Insert a `search_logs` row.
2. Normalize the name, status, incorporation date, address, and external registration number, then compute a SHA-256 content hash.
3. Compare the hash with `Companies.ContentHash`.
4. On the first profile view, create version `1`.
5. If content changed, increment `CurrentVersion`, update `Companies`, and append an immutable `CompanyHistory` row.
6. If content did not change, keep the version number and update `LastSeenAt` without adding history.
7. Link the request to the company and commit the transaction.

The profile response includes `version_count`. `GET /registry_id/{id}/history` returns snapshots ordered by `version_number` descending.

## Reading Data

### Search activity API

`GET /search_logs?page=1&pageSize=20&query=Lloyds` reads logs newest first. The optional query matches user input, linked company names, or company numbers. A company name is returned only when a log links to exactly one company; raw `ApiResponse` content is never exposed.

### Companies linked to a search

```sql
SELECT
    log.SearchLogId,
    log.UserInput,
    log.SearchedAt,
    log.HttpStatus,
    company.CompanyNumber,
    company.CompanyName,
    company.CompanyStatus
FROM search_logs AS log
LEFT JOIN search_log_companies AS link
    ON link.SearchLogId = log.SearchLogId
LEFT JOIN Companies AS company
    ON company.CompanyNumber = link.CompanyNumber
WHERE log.SearchLogId = @SearchLogId;
```

The `LEFT JOIN` preserves a search log when there were no matching companies.

### Company version history

```sql
SELECT
    VersionNumber,
    RecordedAt,
    CompanyName,
    CompanyStatus,
    IncorporationDate,
    Address,
    ExternalRegistrationNumber
FROM CompanyHistory
WHERE CompanyNumber = @CompanyNumber
ORDER BY VersionNumber DESC;
```

## Development Rules

- Use parameterized SQL for all values.
- Keep each log/company/link/version write in one transaction.
- Capture `SearchLogId` immediately after inserting the log.
- Treat company numbers as strings.
- Do not update existing `CompanyHistory` rows.
- Add schema changes through `EnsureSchemaAsync` and record one-time data migrations in `SchemaMigrations`.

## Regenerating Diagrams

From the repository root:

```powershell
npx --yes @mermaid-js/mermaid-cli -i images/database-schema.mmd -o images/database-schema.png --theme neutral --backgroundColor white --size 1400 --scale 2
npx --yes @mermaid-js/mermaid-cli -i images/database-data-flow.mmd -o images/database-data-flow.png --theme neutral --backgroundColor white --size 1400 --scale 2
```