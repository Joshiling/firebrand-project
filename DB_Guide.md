# for developers writing database functions

## DB Structure



![DB UML Diagram](images\DB_UML_Diagram.png)   

## DB Writing Process

![DB_Writing_Process](images\DB_Writing_Process.png)   
**Companies**
   CompanyNumber (primary key) <--
**search_log_companies**
   CompanyNumber (foreign key)
   SearchLogId   (foreign key)
-->
**search_logs**
   SearchLogId (primary key)


CompaniesStores company details once per Companies House company number.
CompanyNumber is the primary key. 
Other  fields are CompanyName, CompanyStatus, IncorporationDate, Address, and ExternalRegistrationNumber.

**search_logs** Stores one record per user search, including the input and API response.

SearchLogId is the primary key. 
Other fields are UserInput, SearchedAt, ApiResponse, ResultCount, and HttpStatus.

**search_log_companies** Connects a search to each company returned by that search.(SearchLogId, CompanyNumber) is the composite primary key; both columns are foreign keys.

This is a many-to-many relationship: a name search may return several companies, and the same company may appear in several searches. A search with no results can still have a search_logs row with no rows in search_log_companies. Foreign keys express the links between the tables


### Writing a search to DB

**For each request to Companies House:**

Insert one search_logs row with the exact user input, response body, result count, and HTTP status.
Capture its new SearchLogId.
For each company actually returned in that response, insert or update its details in Companies, keyed by the returned company_number.
Insert (SearchLogId, CompanyNumber) into search_log_companies for each returned company.
If there are no results or the API fails, keep the log row but create no company links.

Use a transaction so the log, company records, and links are saved together. Capture SearchLogId immediately after inserting the log; do not rely on last_insert_rowid() after inserting other rows. Use parameterized SQL for user input and response content.


### Reading Data from DB

**To get the companies associated with a search:**

```
SELECT
    l.SearchLogId,
    l.UserInput,
    l.SearchedAt,
    l.HttpStatus,
    c.CompanyNumber,
    c.CompanyName,
    c.CompanyStatus
FROM search_logs AS l
LEFT JOIN search_log_companies AS link
    ON link.SearchLogId = l.SearchLogId
LEFT JOIN Companies AS c
    ON c.CompanyNumber = link.CompanyNumber
WHERE l.SearchLogId = ?;
```

LEFT JOIN still returns the search log when there were zero matching companies. To retrieve the original API output, read ApiResponse from search_logs using SearchLogId.
