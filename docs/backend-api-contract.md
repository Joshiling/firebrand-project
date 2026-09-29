# Backend API Contract

This contract describes the confirmed C# routes required by the Angular company-search frontend. The browser calls only the C# backend. The backend owns the Companies House API key and calls Companies House on the frontend's behalf.

## Base URL

The local backend origin is still to be agreed. The confirmed relative routes below work with either Angular proxy configuration or an agreed backend origin.

All successful responses use `Content-Type: application/json`.

## Search by registration number

### Frontend request

```http
GET /registry_id?registry_id=00002065
```

The `registry_id` parameter is required after trimming. It must remain a string because leading zeros are significant and valid company numbers can contain prefixes such as `SC123456`.

The frontend currently identifies likely company numbers with either eight digits or two letters followed by six digits. The backend must validate the value independently.

Optional filters may be added to the same request:

```http
GET /registry_id?registry_id=00002065&company_status=Active&company_type=Plc&location=London
```

`company_status` and `company_type` are enum query parameters. Valid status values are `Active`, `Dissolved`, `Open`, `Closed`, `ConvertedClosed`, `Receivership`, `Administration`, `Liquidation`, `InsolvencyProceedings`, `VoluntaryArrangement`, `Registered`, and `Removed`. Valid type values are `PrivateUnlimited`, `Ltd`, `Plc`, `OldPublicCompany`, `PrivateLimitedGuarantorNscLimitedExemption`, `LimitedPartnership`, `PrivateLimitedGuarantorNsc`, `ConvertedOrClosed`, `PrivateUnlimitedNsc`, `PrivateLimitedSharesSection30Exemption`, `ProtectedCellCompany`, `AssuranceCompany`, `OverseaCompany`, `Eeig`, `IcvcSecurities`, `IcvcWarrant`, `IcvcUmbrella`, `RegisteredSocietyNonJurisdictional`, `IndustrialAndProvidentSociety`, `NorthernIreland`, `NorthernIrelandOther`, `RoyalCharter`, `InvestmentCompanyWithVariableCapital`, `UnregisteredCompany`, `LimitedLiabilityPartnership`, `Other`, `EuropeanPublicLimitedLiabilityCompanySe`, `UkEstablishment`, and `ScottishPartnership`.

Repeat a parameter to select multiple statuses or types; comma-separated enum values are not accepted. Multiple values within one filter are alternatives; different filters combine with AND semantics. For registration-number searches, status and type are matched against the returned search item, while `location` is matched as a case-insensitive substring of its address fields. A missing address does not match a location filter. The enum values map to the corresponding Companies House API codes.

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

The optional `company_status`, `company_type`, and `location` filters are passed to the Companies House advanced company search endpoint when at least one is supplied. Status and type accept repeated or comma-separated values. `location` is a free-text upstream location filter, not a country- or jurisdiction-specific filter. Filtered requests return up to the first 100 matches.

```http
GET /name?name=Lloyds&company_status=Active&company_type=Plc&location=London
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

## Error responses

Use these HTTP statuses consistently for all three routes:

| Status                    | Meaning                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `400 Bad Request`         | Missing or invalid name or registration number                     |
| `404 Not Found`           | Company details were not found                                     |
| `429 Too Many Requests`   | Companies House rate limit was reached                             |
| `502 Bad Gateway`         | Companies House returned an unexpected failure or invalid response |
| `503 Service Unavailable` | Companies House could not be reached or timed out                  |

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
