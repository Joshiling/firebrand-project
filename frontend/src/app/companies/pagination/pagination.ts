import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pagination {
  readonly currentPage = input.required<number>();
  readonly totalResults = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly disabled = input(false);
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalResults() / this.pageSize())),
  );

  protected goTo(page: number): void {
    if (!this.disabled() && page >= 1 && page <= this.totalPages()) {
      this.pageChange.emit(page);
    }
  }
}
