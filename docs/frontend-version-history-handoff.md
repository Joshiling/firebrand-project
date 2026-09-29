# Frontend Handoff: Company Version History

## Target Branch
`version-history-frontend`

## Overview
Implement a "Show history" UI feature on the company details page (`app-company-details`).
- When a user views a company profile, check if previous versions exist (`version_count > 1` or `history.length > 1`).
- If previous versions exist, display a "Show history" button using the existing `lucideHistory` icon.
- When clicked, load and display the company's historical snapshots in a modal/drawer or expandable timeline list showing what fields changed across versions (e.g. previous addresses or names).

---

## API Contract

### 1. Updated Profile Response
`GET /registry_id/{id}` now returns `version_count`:
```json
{
  "company_name": "LLOYDS BANK PLC",
  "company_number": "00002065",
  "company_status": "active",
  "type": "plc",
  "version_count": 3
}
```

### 2. New History Endpoint
```http
GET /registry_id/{id}/history
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

---

## Frontend Files & Components to Touch

### 1. Models
* **`frontend/src/app/companies/companies-house-profile.ts`**:
  Extend `CompaniesHouseCompanyProfile` with:
  ```typescript
  version_count?: number;
  ```
* **`frontend/src/app/companies/company.model.ts`**:
  Add interface:
  ```typescript
  export interface CompanyHistoryEntry {
    versionNumber: number;
    recordedAt: string;
    companyNumber: string;
    companyName: string;
    companyStatus?: string;
    incorporationDate?: string;
    address?: string;
    externalRegistrationNumber?: string;
  }
  ```

### 2. Service Layer
* **`frontend/src/app/companies/company-search.service.ts`**:
  Add abstract method:
  ```typescript
  abstract getHistory(registrationNumber: string): Observable<readonly CompanyHistoryEntry[]>;
  ```
* **`frontend/src/app/companies/http-company-search.service.ts`**:
  Implement:
  ```typescript
  override getHistory(registrationNumber: string): Observable<readonly CompanyHistoryEntry[]> {
    return this.http.get<any[]>(`/registry_id/${encodeURIComponent(registrationNumber)}/history`).pipe(
      map(items => items.map(item => ({
        versionNumber: item.version_number,
        recordedAt: item.recorded_at,
        companyNumber: item.company_number,
        companyName: item.company_name,
        companyStatus: item.company_status,
        incorporationDate: item.incorporation_date,
        address: item.address,
        externalRegistrationNumber: item.external_registration_number
      }))),
      catchError(() => of([]))
    );
  }
  ```
* **`frontend/src/app/companies/mock-company-search.service.ts`**:
  Add mock implementation with sample multiple-version data for local development/tests.

### 3. Company Details Component
* **`frontend/src/app/companies/company-details/company-details.ts`**:
  - Add signals:
    ```typescript
    protected readonly showHistoryModal = signal(false);
    protected readonly historyEntries = signal<readonly CompanyHistoryEntry[]>([]);
    protected readonly loadingHistory = signal(false);
    ```
  - Use the already imported `lucideHistory` icon.
  - Implement `toggleHistory()` to fetch history from `CompanySearchService` when opened.
* **`frontend/src/app/companies/company-details/company-details.html`**:
  - In header actions (next to company name/status), conditionally render button:
    ```html
    @if ((profile()?.version_count ?? 0) > 1) {
      <button type="button" class="history-toggle-btn" (click)="toggleHistory()">
        <ng-icon name="lucideHistory" aria-hidden="true" />
        <span>Show history ({{ profile()?.version_count }})</span>
      </button>
    }
    ```
  - Add history panel/dialog:
    - Lists records from newest (`Version 3 (Current)`) to oldest (`Version 1`).
    - Highlights timestamp (`recordedAt | date:'medium'`), company name, status, and address.
    - Highlights what changed from the previous version (e.g. address change badge).

---

## Verification & Testing
1. Run component unit tests:
   ```powershell
   Set-Location frontend
   npm test -- --watch=false
   ```
2. Verify production build:
   ```powershell
   npm run build
   ```
3. Test locally against backend:
   ```powershell
   npm start
   ```
   Navigate to a company with multiple versions (e.g. `http://localhost:4200/company/00002065`) and verify "Show history" displays historical records.
