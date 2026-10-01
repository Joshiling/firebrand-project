# Backend API Contract

This contract describes the confirmed C# routes required by the Angular company-search frontend. The browser calls only the C# backend. The backend owns the Companies House API key and calls Companies House on the frontend's behalf.

## Base URL

The local backend origin is still to be agreed. The confirmed relative routes below work with either Angular proxy configuration or an agreed backend origin.

All successful responses use `Content-Type: application/json`.

## Search filter options

### Frontend request

```http
GET /search/filters
```

This route returns the enum names accepted by the optional `company_status`, `company_type`, and `country` parameters on the two company-search routes. Clients should load these values instead of maintaining their own lists.

### Successful response

Return `200 OK` with the supported values:

```json
{
  "companyStatuses": ["Active", "Dissolved"],
  "companyTypes": ["Ltd", "Plc"],
  "countries": ["England", "Scotland"]
}
```

The examples above are abbreviated. The response contains every value supported by the backend enums. See [company-search-filtering.md](company-search-filtering.md) for filter-combination rules, upstream behavior, and the current frontend availability.

## Search by registration number

### Frontend request

```http
GET /registry_id?registry_id=00002065
```

The `registry_id` parameter is required after trimming. It must remain a string because leading zeros are significant and valid company numbers can contain prefixes such as `SC123456`.

The frontend currently identifies likely company numbers with either eight digits or two letters followed by six digits. The backend must validate the value independently.

Optional filters may be added to the same request:

```http
GET /registry_id?registry_id=00002065&company_status=Active&company_type=Plc&city=London&country=England
```

`company_status` and `company_type` are enum query parameters. Valid status values are `Active`, `Dissolved`, `Open`, `Closed`, `ConvertedClosed`, `Receivership`, `Administration`, `Liquidation`, `InsolvencyProceedings`, `VoluntaryArrangement`, `Registered`, and `Removed`. Valid type values are `PrivateUnlimited`, `Ltd`, `Plc`, `OldPublicCompany`, `PrivateLimitedGuarantorNscLimitedExemption`, `LimitedPartnership`, `PrivateLimitedGuarantorNsc`, `ConvertedOrClosed`, `PrivateUnlimitedNsc`, `PrivateLimitedSharesSection30Exemption`, `ProtectedCellCompany`, `AssuranceCompany`, `OverseaCompany`, `Eeig`, `IcvcSecurities`, `IcvcWarrant`, `IcvcUmbrella`, `RegisteredSocietyNonJurisdictional`, `IndustrialAndProvidentSociety`, `NorthernIreland`, `NorthernIrelandOther`, `RoyalCharter`, `InvestmentCompanyWithVariableCapital`, `UnregisteredCompany`, `LimitedLiabilityPartnership`, `Other`, `EuropeanPublicLimitedLiabilityCompanySe`, `UkEstablishment`, and `ScottishPartnership`.

Repeat a parameter to select multiple statuses or types; comma-separated enum values are not accepted. Multiple values within one filter are alternatives; different filters combine with AND semantics. `city` is a case-insensitive exact match against the registered-office `locality` field, not the formatted address. `country` is an enum matched against the registered-office `country` field. Missing locality/country values do not match their respective filters. The enum values map to the corresponding Companies House API codes.

Supported `country` enum values are `Wales`, `England`, `Scotland`, `GreatBritain`, `NotSpecified`, `UnitedKingdom`, and `NorthernIreland`.

### Successful response

Return `200 OK` with a JSON list of matching `Company` results. An exact registration number will normally produce zero or one item.

```json
[
  {
    "company_name": "LLOYDS BANK PLC",
    "company_number": "00002065",
    "company_status": "active",
    "type": "plc",
    "registered_office_address": {
      "address_line_1": "25 Gresham Street",
      "locality": "London",
      "postal_code": "EC2V 7HN"
    }
  }
]
```

Return `200 OK` with `[]` when no company matches.

## Search by company name

### Frontend request

```http
GET /name?name=Lloyds
```

The `name` parameter is required after trimming. URL-encode it rather than concatenating unescaped user input into a URL.

The optional `company_status`, `company_type`, `city`, and `country` filters are passed to the Companies House advanced company search endpoint when at least one is supplied. Status and type accept repeated enum parameters. `city` matches the registered-office locality exactly, and `country` is a registered-office country enum. Since Companies House exposes only a broad `location` search parameter, the backend also verifies returned locality/country fields before returning results. Filtered requests return up to the first 100 upstream candidates.

```http
GET /name?name=Lloyds&company_status=Active&company_type=Plc&city=London&country=England
```

### Successful response

Return `200 OK` with a JSON list of matching `Company` results using the same item shape as the registration-number search.

```json
[
  {
    "company_name": "LLOYDS BANK PLC",
    "company_number": "00002065",
    "company_status": "active",
    "type": "plc",
    "registered_office_address": {
      "address_line_1": "25 Gresham Street",
      "locality": "London",
      "postal_code": "EC2V 7HN"
    }
  }
]
```

Return `200 OK` with `[]` when no companies match. Unfiltered searches use the standard Companies House search endpoint and return the first 100 matches. Filtered name searches use advanced search and return up to 100 matching items. The Angular MVP paginates the returned list locally at 10 results per page.

## Company details

### Frontend request

```http
GET /registry_id/00002065
```

This route retrieves the full profile displayed by the CompanyLens details page after a user selects a search result. Angular calls it through `HttpCompanySearchService` and the development proxy. The path value remains a string.

### Successful response

Return `200 OK` with one full company profile. The supplied Lloyds response is the representative shape:

```json
{
  "company_name": "LLOYDS BANK PLC",
  "company_number": "00002065",
  "company_status": "active",
  "registered_office_address": {
    "address_line_1": "25 Gresham Street",
    "locality": "London",
    "postal_code": "EC2V 7HN"
  },
  "type": "plc"
}
```

The backend maps accounts, confirmation statements, company flags, previous names, SIC codes, registered address, links, and other profile metadata. Missing optional Companies House fields remain nullable so the details page can show an explicit fallback. Return `404 Not Found` if the company does not exist.

## Company history

### Frontend request

```http
GET /registry_id/00002065/history
```

The `registry_id` path value is validated using the same rules as the company-details route.

### Successful response

Return `200 OK` with company-profile snapshots ordered by `version_number` descending. Return `404 Not Found` when the company has no stored history.

## Search activity

### Frontend request

```http
GET /search_logs?page=1&pageSize=20&query=Lloyds
```

This route reads search activity from `database.db`, ordered newest first. `page` must be at least 1 and `pageSize` must be between 1 and 100. Both values default to 1 and 20 respectively. The optional `query` parameter filters case-insensitively by recorded input, linked company name, or company number and is limited to 100 characters.

### Successful response

```json
{
  "items": [
    {
      "searchLogId": 42,
      "userInput": "Lloyds",
      "companyName": "LLOYDS BANK PLC",
      "searchedAt": "2026-09-29T10:30:00+00:00",
      "resultCount": 100,
      "httpStatus": 200
    }
  ],
  "totalResults": 1,
  "page": 1,
  "pageSize": 20,
  "query": "Lloyds"
}
```

`companyName` is null when a log has zero or multiple linked companies. The response deliberately excludes `ApiResponse`; the activity screen needs operational metadata, not the potentially large raw Companies House payload.

## Error responses

Use these HTTP statuses consistently for the company search, details, and history routes:

| Status                    | Meaning                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `400 Bad Request`         | Missing or invalid name or registration number                     |
| `404 Not Found`           | Company details were not found                                     |
| `502 Bad Gateway`         | Companies House returned an unexpected failure, invalid response, or transport error |
| `503 Service Unavailable` | Companies House rate limit was reached or the API key is unavailable                 |

Errors should return JSON without exposing API keys, upstream authorization headers, stack traces, or internal exception details. A minimal response is:

```json
{
  "message": "Company service is temporarily unavailable."
}
```

## Security and local development

- Keep the Companies House API key in backend configuration or user secrets.
- Never send the API key to Angular or commit it to Git.
- Set a sensible outbound timeout and pass cancellation tokens through the C# request.
- Angular uses `frontend/proxy.conf.json` during local development to forward company routes to the backend without exposing credentials or requiring browser CORS access.
- Keep backend response field names synchronized with the TypeScript contract in `HttpCompanySearchService`.
