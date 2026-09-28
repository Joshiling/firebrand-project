# Backend API Contract

This contract describes the C# endpoints required by the Angular company-search frontend. The browser calls only the C# backend. The backend owns the Companies House API key and calls Companies House on the frontend's behalf.

## Base URL

The local backend URL is still to be agreed. Examples below use the relative `/api` path so they work with either Angular proxy configuration or an agreed backend origin.

All successful responses use `Content-Type: application/json`.

## Search by company name

### Frontend request

```http
GET /api/companies/search?query=Lloyds&page=1&pageSize=10
```

Parameters:

| Parameter | Type | Rules |
| --- | --- | --- |
| `query` | string | Required after trimming |
| `page` | integer | One-based and at least `1` |
| `pageSize` | integer | Between `1` and `100` |

### Companies House request

```http
GET https://api.company-information.service.gov.uk/search/companies?q=Lloyds&items_per_page=10&start_index=0
```

Convert the frontend page number to the Companies House offset with:

```text
start_index = (page - 1) * pageSize
```

URL-encode all query parameters. Do not construct the upstream URL by concatenating unescaped user input.

### Successful response

For the first integration, return the Companies House search response unchanged. Its collection shape is different from a single company profile. A representative subset is:

```json
{
  "items": [
    {
      "title": "LLOYDS BANK PLC",
      "company_number": "00002065",
      "company_status": "active",
      "company_type": "plc",
      "address": {
        "address_line_1": "25 Gresham Street",
        "locality": "London",
        "postal_code": "EC2V 7HN"
      }
    }
  ],
  "items_per_page": 10,
  "start_index": 0,
  "total_results": 1
}
```

An unsuccessful search with no matches should normally return `200 OK` with an empty `items` array and `total_results: 0`.

## Lookup by registration number

### Frontend request

```http
GET /api/companies/00002065
```

`companyNumber` is always a string. Never parse it as an integer because leading zeros are significant and valid numbers can contain prefixes such as `SC123456`.

The frontend currently identifies likely company numbers with either eight digits or two letters followed by six digits. The backend must still validate the value independently.

### Companies House request

```http
GET https://api.company-information.service.gov.uk/company/00002065
```

### Successful response

Return the Companies House company-profile response unchanged for the first integration. The supplied Lloyds example includes fields such as:

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

Additional Companies House profile fields can pass through unchanged. The Angular service maps the fields needed by the results UI.

## Error responses

Use these HTTP statuses consistently for both routes:

| Status | Meaning |
| --- | --- |
| `400 Bad Request` | Missing or invalid query, page, page size, or company number |
| `404 Not Found` | Registration number was not found |
| `429 Too Many Requests` | Companies House rate limit was reached |
| `502 Bad Gateway` | Companies House returned an unexpected failure or invalid response |
| `503 Service Unavailable` | Companies House could not be reached or timed out |

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
- Allow the Angular development origin, normally `http://localhost:4200`, through development CORS configuration, or agree an Angular development proxy.
- Confirm the final backend base URL before replacing `MockCompanySearchService` with `HttpClient`.