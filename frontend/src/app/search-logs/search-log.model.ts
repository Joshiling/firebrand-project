export interface SearchLogEntry {
  searchLogId: number;
  userInput: string;
  searchedAt: string;
  resultCount: number;
  httpStatus: number;
}

export interface SearchLogPage {
  items: readonly SearchLogEntry[];
  totalResults: number;
  page: number;
  pageSize: number;
}
