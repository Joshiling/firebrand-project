import { TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

describe('Pagination', () => {
  // [total results, current page, previous disabled, next disabled, total pages].
  it.each([
    // Empty results still show one page.
    [0, 1, true, true, 1],
    // First page: only Next is available.
    [23, 1, true, false, 3],
    // Middle page: both directions are available.
    [23, 2, false, false, 3],
    // Last page: only Previous is available.
    [23, 3, false, true, 3],
  ])('renders boundaries for %i results on page %i', (total, page, previousDisabled, nextDisabled, pages) => {
    const fixture = TestBed.createComponent(Pagination);
    fixture.componentRef.setInput('currentPage', page);
    fixture.componentRef.setInput('totalResults', total);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('label', 'Company search pages');
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(previousDisabled);
    expect(buttons[1].disabled).toBe(nextDisabled);
    expect(fixture.nativeElement.textContent).toContain(`Page ${page} of ${pages}`);
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe('Company search pages');

    const changed = vi.fn();
    fixture.componentInstance.pageChange.subscribe(changed);
    buttons[0].click();
    buttons[1].click();
    // Only enabled buttons emit the neighboring page number.
    expect(changed.mock.calls.map(([value]) => value)).toEqual([
      ...(!previousDisabled ? [page - 1] : []), ...(!nextDisabled ? [page + 1] : []),
    ]);
    changed.mockClear();
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    buttons[0].click();
    buttons[1].click();
    expect(changed).not.toHaveBeenCalled();
  });
});