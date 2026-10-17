import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StudentPublicBooksPanel } from './StudentPublicBooksPanel';
import type { PublicBookCatalogReadiness } from '../../services/materialCatalog/publicBookCatalogReadiness.service';
const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));
vi.mock('../../hooks/useNavigation', () => ({ useNavigation: () => ({ navigateTo }) }));

it('opens canonical Public practice and keeps retry and paging reachable with retained rows', () => {
  const onAction = vi.fn();
  const onRetry = vi.fn();
  const onLoadMore = vi.fn();
  render(<StudentPublicBooksPanel books={[{ bookId: 'book-1', title: 'Book title' } as PublicBookCatalogReadiness]}
    loading={false} error="Offline" hasMore onRetry={onRetry} onLoadMore={onLoadMore} onAction={onAction} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Book' }));
  expect(navigateTo).toHaveBeenCalledWith('STUDENT_PRACTICE', { materialId: 'book-1?bookSurface=public&bookId=book-1' }, { reason: 'student_library_public_book_open' });
  expect(onAction).toHaveBeenCalledWith('openPublicBook', { bookId: 'book-1' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(onLoadMore).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Open Book' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
});
