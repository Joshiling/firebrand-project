# Client Onboarding and Company Verification MVP

Frontend company search for the client onboarding project. The Angular application currently uses clearly labelled sample data while the team agrees the C# backend contract.

## Current scope

- Search by partial company name or exact registration number
- Display company name, registration number, status, type, and registered address
- Paginate matching results at 10 companies per page
- Handle empty input, no results, loading, and service errors
- Support keyboard navigation and responsive screen sizes

Authentication, saved companies, onboarding forms, and verification decisions are outside this frontend MVP.

## Run locally

The current project was generated with Angular 22.2 and npm 11.19.

```powershell
Set-Location frontend
npm install
npm start
```

Open the URL printed by Angular, normally `http://localhost:4200`.

## Verify

```powershell
Set-Location frontend
npm test -- --watch=false
npm run build
```

## Mock data

`MockCompanySearchService` implements the same frontend-owned interface intended for the future HTTP service. Its fixtures use the snake_case Companies House company-profile shape, which is mapped into the frontend display model at the service boundary.

Queries matching eight digits or two letters followed by six digits are treated as registration numbers. Other input is treated as a company name. Company numbers must remain strings because values can have leading zeros (`00002065`) or letter prefixes (`SC123456`).

The displayed records are demonstration data and must not be treated as current Companies House records.

## Backend handoff

If the team wants separate backend requests for the two Companies House operations, the proposed contract for discussion is:

```http
GET /api/companies/00002065
GET /api/companies/search?query=Lloyds&page=1&pageSize=10
```

The future Angular HTTP service can use the tested query classifier to select the route. Components continue to call one `search(...)` method and do not need to know which endpoint was selected.

The registration-number route can return a single company profile like the supplied Lloyds response. The name-search route must return a result collection with a total count and pagination details; its response will not naturally have the same shape as a single company profile. The C# backend may either expose the source shapes or normalize both into agreed frontend DTOs.

Before replacing the mock, agree the endpoint URL, pagination convention, optional fields, error responses, CORS or development proxy setup, and how Companies House rate-limit errors are represented. The frontend must call only the C# backend; Companies House credentials must never be placed in browser code.

## Git workflow

Frontend work is developed and pushed on `frontend-dhruv`. Completed work is reviewed through a pull request into `main`; it is not pushed directly to `main`.