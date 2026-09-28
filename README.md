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

`MockCompanySearchService` implements the same frontend-owned interface intended for the future HTTP service. It performs case-insensitive partial name matching, exact case-insensitive registration-number matching, and asynchronous pagination.

The displayed records are demonstration data and must not be treated as current Companies House records.

## Backend handoff

The proposed contract for team discussion is:

```http
GET /api/companies?query=Tesco&page=1&pageSize=10
```

```json
{
	"items": [
		{
			"name": "Tesco PLC",
			"registrationNumber": "00445790",
			"status": "Active",
			"type": "Public limited company",
			"registeredAddress": {
				"addressLine1": "Example address",
				"locality": "Welwyn Garden City",
				"postalCode": "AL7 1AA"
			}
		}
	],
	"totalResults": 1,
	"page": 1,
	"pageSize": 10
}
```

Before replacing the mock, agree the endpoint URL, pagination convention, optional fields, error responses, CORS or development proxy setup, and how Companies House rate-limit errors are represented. The frontend must call only the C# backend; Companies House credentials must never be placed in browser code.

## Git workflow

Frontend work is developed and pushed on `frontend-dhruv`. Completed work is reviewed through a pull request into `main`; it is not pushed directly to `main`.