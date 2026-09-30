# Database Tables Explained

This document explains the CompanyLens SQLite database for someone with no previous knowledge of it.

## What the Database Is For

The database answers three main questions:

1. What is the latest information we know about a company?
2. What did that company look like in earlier versions?
3. What searches and profile requests have users made?

Five tables work together to answer those questions:

| Table | Simple purpose |
| --- | --- |
| `Companies` | Stores the latest known details for each company. |
| `CompanyHistory` | Stores older, read-only versions of company details. |
| `search_logs` | Records each search or profile request. |
| `search_log_companies` | Connects a request to the companies returned by it. |
| `SchemaMigrations` | Records database upgrades that have already run. |

![CompanyLens database schema](../images/database-schema.png)


## `Companies`: The Latest Company Details

Think of `Companies` as the current information card for each company. There is one row per company number.

Example:

| CompanyNumber | CompanyName | Address | CurrentVersion |
| --- | --- | --- | --- |
| `00002065` | `LLOYDS BANK PLC` | `25 Gresham Street, London, EC2V 7HN` | `3` |

`CompanyNumber` is the primary key. It is stored as text because leading zeros and letter prefixes are significant.

The table stores the latest:

- company name;
- company status;
- incorporation date;
- registered address; and
- external registration number, when applicable.

It also stores three version-history values:

- `CurrentVersion`: the latest version number;
- `ContentHash`: a SHA-256 fingerprint used to detect changes; and
- `LastSeenAt`: when the complete profile was last retrieved.

A normal company search can update this current row. It does not create history because a search result may contain only part of the complete company profile.

## `CompanyHistory`: The Version Archive

Think of `CompanyHistory` as a filing cabinet containing previous copies of company cards.

One company can have several history rows:

| CompanyNumber | VersionNumber | CompanyName | Address |
| --- | --- | --- | --- |
| `00002065` | `3` | `LLOYDS BANK PLC` | `25 Gresham Street, London, EC2V 7HN` |
| `00002065` | `2` | `LLOYDS BANK PLC` | `71 Lombard Street, London, EC3P 3BS` |
| `00002065` | `1` | `LLOYDS BANK LIMITED` | `71 Lombard Street, London, EC3P 3BS` |

Important rules:

- `HistoryId` uniquely identifies a snapshot.
- The combination of `CompanyNumber` and `VersionNumber` must be unique.
- `CompanyNumber` points to the matching row in `Companies`.
- `SearchLogId` can identify the profile request that created the version.
- Existing history rows are not updated during normal use. A detected change creates a new row.

The backend returns these snapshots newest first from:

```http
GET /registry_id/00002065/history
```

## `search_logs`: The Request Diary

Think of `search_logs` as a diary of requests sent to Companies House.

It stores one row for each:

- company-name search;
- registration-number search;
- complete company-profile request;
- failed request; or
- request that returned no companies.

Its main columns are:

| Column | Meaning |
| --- | --- |
| `SearchLogId` | Unique ID for the request. |
| `UserInput` | Exact text or company number submitted by the user. |
| `SearchedAt` | When the request happened. |
| `ApiResponse` | Raw response retained internally. |
| `ResultCount` | Number of results reported. |
| `HttpStatus` | HTTP status recorded for the request. |

The public `/search_logs` endpoint never returns the raw `ApiResponse`.

## `search_log_companies`: The Connector

One search can return many companies, and one company can appear in many searches. `search_log_companies` connects those two sides.

Example:

| SearchLogId | CompanyNumber |
| --- | --- |
| `101` | `00002065` |
| `101` | `02087303` |
| `118` | `00002065` |

This means:

- search `101` returned two companies;
- search `118` also returned Lloyds; and
- Lloyds appeared in more than one search.

The combination of `SearchLogId` and `CompanyNumber` is the primary key, which prevents a company being linked to the same request twice.

A failed or zero-result search still has a `search_logs` row, but it has no rows in `search_log_companies`.

## `SchemaMigrations`: The Upgrade Checklist

Think of `SchemaMigrations` as a checklist of database upgrades that have already completed.

The version-history upgrade is recorded as:

```text
company-version-history-v1
```

The first time this migration runs, the backend:

1. adds version columns to `Companies` if required;
2. creates `CompanyHistory` and its lookup index;
3. calculates hashes for existing companies;
4. creates version `1` snapshots for existing companies; and
5. records the migration so that backfill does not run again.

## How the Tables Work Together

### Name or registration-number search

For `GET /name` or query-form `GET /registry_id`:

1. Insert one row into `search_logs`.
2. Insert or update current rows in `Companies`.
3. Add links to `search_log_companies`.
4. Commit all changes in one transaction.
5. Do not add rows to `CompanyHistory`.

### Full company-profile view

For `GET /registry_id/{id}`:

1. Insert one row into `search_logs`.
2. Calculate a content hash from the full profile.
3. Compare it with `Companies.ContentHash`.
4. Create version `1` for the first profile.
5. If content changed, increment `CurrentVersion` and insert a `CompanyHistory` snapshot.
6. If content did not change, keep the same version and update only `LastSeenAt`.
7. Link the request through `search_log_companies`.

The transaction prevents a partial version being saved if another database change fails.

## Testing the Lloyds Version History

### Why the button was missing

The frontend shows the history button only when the profile contains:

```text
version_count > 1
```

Before adding test data, the local Lloyds profile had `version_count: 1`. Reopening an unchanged profile correctly does not create a fake second version, so the button remained hidden.

### Add real local test data

The repository now includes a deterministic database seeder. From the repository root, run:

```powershell
dotnet run --project tools/SeedLloydsVersionHistory/SeedLloydsVersionHistory.csproj -- database.db
```

The command changes only Lloyds company number `00002065`. It stores three versions with previous names and addresses and can be run repeatedly.

### Start and test the normal application

Start the backend:

```powershell
dotnet run --project api/api.csproj --launch-profile https
```

Start the frontend in another terminal:

```powershell
Set-Location frontend
npm start
```

Then:

1. Open the Angular URL, normally `http://localhost:4200`.
2. Search for `00002065`.
3. Open **LLOYDS BANK PLC**.
4. Select **View history (3)** beside the company status.
5. Confirm that versions `3`, `2`, and `1` appear and show the address and name changes.

If the details page was already open before seeding, perform a full browser refresh so the profile is requested again.

### Verify the backend directly

```powershell
curl.exe -k https://localhost:7097/registry_id/00002065
curl.exe -k https://localhost:7097/registry_id/00002065/history
```

The first response should include:

```json
"version_count": 3
```

The second response should contain three snapshots ordered from version `3` to version `1`.

### Run the automated tests

```powershell
dotnet test tests/Api.Tests/Api.Tests.csproj

Set-Location frontend
npm test -- --watch=false
```

The backend tests use temporary databases and do not alter `database.db`.