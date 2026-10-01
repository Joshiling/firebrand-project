import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';

@Component({
  selector: 'app-pagination',
  imports: [NgIcon],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
})
export class Pagination {
  readonly currentPage = input.required<number>();
  readonly totalResults = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly disabled = input(false);
  readonly label = input('Pagination');
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalResults() / this.pageSize())),
  );

  // Emits a page change only when the destination is valid and paging is enabled.
  protected goTo(page: number): void {
    if (!this.disabled() && page >= 1 && page <= this.totalPages()) {
      this.pageChange.emit(page);
    }
  }
}
