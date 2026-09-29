# firebrand-project

### Database
![DB UML Diagram](DB_UML_Diagram.png)  

## Companies House API

#### Set API key env variable in your terminal:

```shell
$apiKey = "abc"
```

#### Get company by ID:

```shell
curl.exe -u "${apikey}:" https://api.company-information.service.gov.uk/company/00002065
```

#### Example Data:

```JSON
{
  "accounts": {
    "accounting_reference_date": {
      "day": "31",
      "month": "12"
    },
    "last_accounts": {
      "made_up_to": "2025-12-31",
      "period_end_on": "2025-12-31",
      "period_start_on": "2025-01-01",
      "type": "group"
    },
    "next_accounts": {
      "due_on": "2027-06-30",
      "overdue": false,
      "period_end_on": "2026-12-31",
      "period_start_on": "2026-01-01"
    },
    "next_due": "2027-06-30",
    "next_made_up_to": "2026-12-31",
    "overdue": false
  },
  "can_file": true,
  "company_name": "LLOYDS BANK PLC",
  "company_number": "00002065",
  "company_status": "active",
  "confirmation_statement": {
    "last_made_up_to": "2026-05-06",
    "next_due": "2027-05-20",
    "next_made_up_to": "2027-05-06",
    "overdue": false
  },
  "date_of_creation": "1865-04-20",
  "etag": "8259055527962f7d8a7133c1d55c10b900e50b46",
  "has_charges": false,
  "has_insolvency_history": false,
  "jurisdiction": "england-wales",
  "last_full_members_list_date": "2016-05-09",
  "links": {
    "persons_with_significant_control": "/company/00002065/persons-with-significant-control",
    "self": "/company/00002065",
    "charges": "/company/00002065/charges",
    "filing_history": "/company/00002065/filing-history",
    "officers": "/company/00002065/officers"
  },
  "previous_company_names": [
    {
      "ceased_on": "2013-09-23",
      "effective_from": "1999-06-28",
      "name": "LLOYDS TSB BANK PLC"
    },
    {
      "ceased_on": "1999-06-28",
      "effective_from": "1982-02-01",
      "name": "LLOYDS BANK PLC"
    },
    {
      "ceased_on": "1982-02-01",
      "effective_from": "1889-04-05",
      "name": "LLOYDS BANK LIMITED"
    },
    {
      "ceased_on": "1889-04-05",
      "effective_from": "1884-04-07",
      "name": "LLOYDS, BARNETTS AND BOSANQUETS BANK LIMITED"
    },
    {
      "ceased_on": "1884-04-07",
      "effective_from": "1865-04-20",
      "name": "LLOYDS BANKING COMPANY LIMITED"
    }
  ],
  "registered_office_address": {
    "address_line_1": "25 Gresham Street",
    "locality": "London",
    "postal_code": "EC2V 7HN"
  },
  "registered_office_is_in_dispute": false,
  "sic_codes": [
    "64191"
  ],
  "type": "plc",
  "undeliverable_registered_office_address": false,
  "has_super_secure_pscs": false
}
```

#### Search:

```shell
curl.exe -u "${apikey}:" https://api.company-information.service.gov.uk/search/companies?q=tesco
```
### Database
![DB UML Diagram](DB_UML_Diagram.png)  
This repository contains the database, backend, and CompanyLens Angular frontend for the client onboarding project.

## Database

See the [database guide](DB_Guide.md) for setup and usage details.

![Database UML diagram](DB_UML_Diagram.png)

## Frontend: CompanyLens

CompanyLens is the Angular company search and verification frontend for client onboarding. It currently uses clearly labelled sample data behind a backend-ready service boundary.

## Current scope

- Search by partial company name or exact registration number
- Display company name, registration number, status, type, and registered address
- Open a separate full-profile page for each company
- Preserve the submitted query and page when navigating between results and details
- Paginate matching results at 10 companies per page
- Handle empty input, no results, loading, and service errors
- Support keyboard navigation and responsive screen sizes

Authentication, saved companies, onboarding forms, and verification decisions are outside this frontend MVP.

## Run the frontend locally

The current project was generated with Angular 22.2 and npm 11.19.

```powershell
Set-Location frontend
npm install
npm start
```

Open the URL printed by Angular, normally `http://localhost:4200`.

## Verify the frontend

```powershell
Set-Location frontend
npm test -- --watch=false
npm run build
```

## Mock data

`MockCompanySearchService` implements the same frontend-owned interface intended for the future HTTP service. Its fixtures use the snake_case Companies House company-profile shape. Search data is mapped into the compact frontend display model at the service boundary, while the details page consumes the full profile.

Queries matching eight digits or two letters followed by six digits are treated as registration numbers. Other input is treated as a company name. Company numbers must remain strings because values can have leading zeros (`00002065`) or letter prefixes (`SC123456`).

The displayed records are demonstration data and must not be treated as current Companies House records.

## Backend handoff

The confirmed request, response, validation, error, CORS, and API-key requirements are documented in [Backend API Contract](docs/backend-api-contract.md).

```http
GET /registry_id?registry_id=00002065
GET /name?name=Lloyds
GET /registry_id/00002065
```

The first two routes return lists of `Company` results. The third route returns the full profile used by the company-details page. The frontend currently exercises the same behavior through the mock service.

The future Angular HTTP service will use the tested query classifier to select either `/registry_id` or `/name`, and `getDetails(...)` will call `/registry_id/{id}`. Components remain isolated from endpoint selection. The current frontend can paginate the returned search list locally.

Before replacing the mock, the team still needs to confirm the backend base URL and final `Company` JSON field names. The frontend must call only the C# backend; Companies House credentials must never be placed in browser code.

## Git workflow

Feature work is developed on dedicated branches and reviewed through pull requests into `main`; it is not pushed directly to `main`.
