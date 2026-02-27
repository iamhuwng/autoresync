/**
 * usePagination Hook
 * 
 * Generic reusable pagination hook for any list of items.
 * Handles page state management, item slicing, and navigation.
 * 
 * @module hooks/monitor/usePagination
 */

import { useState, useMemo } from 'react';

export interface PaginationResult<T> {
  currentPage: number;
  totalPages: number;
  paginatedItems: T[];
  showPagination: boolean;
  handlePageChange: (page: number) => void;
}

/**
 * Custom hook for paginating a list of items.
 * 
 * Features:
 * - Automatic page calculation
 * - Item slicing for current page
 * - Page navigation handler
 * - Show/hide pagination based on item count
 * 
 * @template T - The type of items being paginated
 * @param items - The full array of items to paginate
 * @param itemsPerPage - Number of items to display per page (default: 30)
 * @returns PaginationResult object with pagination state and controls
 * 
 * @example
 * ```typescript
 * const { currentPage, paginatedItems, handlePageChange, showPagination } = 
 *   usePagination(students, 30);
 * 
 * // Render paginated items
 * {paginatedItems.map(item => <ItemCard key={item.id} item={item} />)}
 * 
 * // Render pagination controls
 * {showPagination && <Pagination page={currentPage} onChange={handlePageChange} />}
 * ```
 */
export function usePagination<T>(
  items: T[],
  itemsPerPage: number = 30
): PaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(1);
  
  // Calculate total pages
  const totalPages = Math.ceil(items.length / itemsPerPage);
  
  // Determine if pagination should be shown
  const showPagination = items.length > itemsPerPage;
  
  // Calculate paginated items for current page
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return items.slice(startIndex, endIndex);
  }, [items, currentPage, itemsPerPage]);
  
  // Handle page change
  const handlePageChange = (page: number) => {
    // Validate page number
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };
  
  // Reset to page 1 when items change significantly
  // This prevents being on page 5 when items reduce to only 1 page
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);
  
  return {
    currentPage,
    totalPages,
    paginatedItems,
    showPagination,
    handlePageChange,
  };
}
