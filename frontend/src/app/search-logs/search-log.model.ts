export interface SearchLogEntry {
  searchLogId: number;
  userInput: string;
  companyName?: string;
  searchedAt: string;
  resultCount: number;
  httpStatus: number;
}

export interface SearchLogPage {
  items: readonly SearchLogEntry[];
  totalResults: number;
  page: number;
  pageSize: number;
  query?: string;
}
