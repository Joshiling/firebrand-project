# firebrand-project

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

## Setting Up Your Companies House API Key

This project uses .NET User Secrets to store API keys securely. API keys are **not stored in the repository** and should never be committed to Git.

### 1. Get a Companies House API Key
Create an API key from the Companies House Developer Hub.

### 2. Add Your Key to User Secrets
From the project directory containing the `.csproj` file, run:

```shell
dotnet user-secrets set "CompaniesHouse:ApiKey" "YOUR_API_KEY_HERE"
```