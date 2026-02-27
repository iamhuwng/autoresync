/**
 * useMaterialLibrary Hook
 * PRD-0016: Solo Study & Homework System
 * 
 * React hook for managing material library state, filtering, and pagination.
 * Provides a clean interface for the StudentLibraryPage.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    getLibraryMaterials,
    getPublicMaterials,
    getRecommendedMaterials,
    enrichWithStudentHistory
} from '../services/materialDiscoveryService';
import type { LibraryFilters, LibraryMaterial, LibrarySource } from '../types/solo.types';

interface UseMaterialLibraryOptions {
    /** Student ID for fetching personalized data */
    studentId: string;

    /** Initial source filter */
    initialSource?: LibrarySource;

    /** Items per page for pagination */
    itemsPerPage?: number;

    /** Whether to auto-fetch on mount */
    autoFetch?: boolean;
}

interface UseMaterialLibraryReturn {
    // Data
    materials: LibraryMaterial[];
    filteredMaterials: LibraryMaterial[];
    paginatedMaterials: LibraryMaterial[];

    // Filters
    filters: LibraryFilters;
    setFilters: (filters: LibraryFilters) => void;
    updateFilter: <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => void;
    clearFilters: () => void;

    // Search
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    debouncedSearchQuery: string;

    // Pagination
    currentPage: number;
    totalPages: number;
    setCurrentPage: (page: number) => void;
    nextPage: () => void;
    prevPage: () => void;

    // Loading & Error
    isLoading: boolean;
    error: string | null;

    // Actions
    refetch: () => Promise<void>;
    fetchBySource: (source: LibrarySource) => Promise<void>;
}

/**
 * Custom hook for managing material library
 */
export function useMaterialLibrary({
    studentId,
    initialSource = 'my_courses',
    itemsPerPage = 12,
    autoFetch = true
}: UseMaterialLibraryOptions): UseMaterialLibraryReturn {

    // State
    const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
    const [filters, setFilters] = useState<LibraryFilters>({
        source: initialSource
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Debounce search query
     * Updates debouncedSearchQuery 500ms after user stops typing
     */
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    /**
     * Fetch materials based on current source filter
     */
    const fetchMaterials = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            let fetchedMaterials: LibraryMaterial[] = [];

            switch (filters.source) {
                case 'my_courses':
                    // Get materials from all enrolled courses
                    // TODO: Get actual enrolled courses for the student
                    // For now, fetch all course materials
                    fetchedMaterials = await getLibraryMaterials({
                        ...filters,
                        source: 'my_courses'
                    });
                    break;

                case 'public':
                    fetchedMaterials = await getPublicMaterials();
                    break;

                case 'recommended':
                    fetchedMaterials = await getRecommendedMaterials(studentId);
                    break;

                case 'recent':
                    // Get all materials and sort by last practiced
                    const allMaterials = await getLibraryMaterials(filters);
                    const withHistory = await enrichWithStudentHistory(allMaterials, studentId);

                    // Filter to only materials that have been practiced
                    fetchedMaterials = withHistory
                        .filter(m => m.studentHistory?.lastPracticed)
                        .sort((a, b) => {
                            const aTime = a.studentHistory?.lastPracticed || 0;
                            const bTime = b.studentHistory?.lastPracticed || 0;
                            return bTime - aTime; // Most recent first
                        });
                    break;

                default:
                    fetchedMaterials = await getLibraryMaterials(filters);
            }

            // Enrich with student history if not already done
            if (filters.source !== 'recent' && filters.source !== 'recommended') {
                fetchedMaterials = await enrichWithStudentHistory(fetchedMaterials, studentId);
            }

            setMaterials(fetchedMaterials);
            setCurrentPage(1); // Reset to first page when data changes

        } catch (err) {
            console.error('Error fetching materials:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch materials');
            setMaterials([]);
        } finally {
            setIsLoading(false);
        }
    }, [filters, studentId]);

    /**
     * Fetch materials by source (convenience method)
     */
    const fetchBySource = useCallback(async (source: LibrarySource) => {
        setFilters(prev => ({ ...prev, source }));
    }, []);

    /**
     * Update a single filter
     */
    const updateFilter = useCallback(<K extends keyof LibraryFilters>(
        key: K,
        value: LibraryFilters[K]
    ) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    /**
     * Clear all filters
     */
    const clearFilters = useCallback(() => {
        setFilters({ source: initialSource });
        setSearchQuery('');
        setDebouncedSearchQuery('');
    }, [initialSource]);

    /**
     * Apply client-side filtering based on debounced search query
     */
    const filteredMaterials = useMemo(() => {
        if (!debouncedSearchQuery) {
            return materials;
        }

        const query = debouncedSearchQuery.toLowerCase();
        return materials.filter(material => {
            const titleMatch = material.title.toLowerCase().includes(query);
            // Could add more fields to search here
            return titleMatch;
        });
    }, [materials, debouncedSearchQuery]);

    /**
     * Calculate pagination
     */
    const totalPages = useMemo(() => {
        return Math.ceil(filteredMaterials.length / itemsPerPage);
    }, [filteredMaterials.length, itemsPerPage]);

    /**
     * Get paginated materials for current page
     */
    const paginatedMaterials = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredMaterials.slice(startIndex, endIndex);
    }, [filteredMaterials, currentPage, itemsPerPage]);

    /**
     * Pagination controls
     */
    const nextPage = useCallback(() => {
        setCurrentPage(prev => Math.min(prev + 1, totalPages));
    }, [totalPages]);

    const prevPage = useCallback(() => {
        setCurrentPage(prev => Math.max(prev - 1, 1));
    }, []);

    /**
     * Auto-fetch on mount and when filters change
     */
    useEffect(() => {
        if (autoFetch) {
            fetchMaterials();
        }
    }, [autoFetch, fetchMaterials]);

    /**
     * Reset to page 1 when filters change
     */
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, debouncedSearchQuery]);

    return {
        // Data
        materials,
        filteredMaterials,
        paginatedMaterials,

        // Filters
        filters,
        setFilters,
        updateFilter,
        clearFilters,

        // Search
        searchQuery,
        setSearchQuery,
        debouncedSearchQuery,

        // Pagination
        currentPage,
        totalPages,
        setCurrentPage,
        nextPage,
        prevPage,

        // Loading & Error
        isLoading,
        error,

        // Actions
        refetch: fetchMaterials,
        fetchBySource
    };
}

/**
 * Hook for fetching a single material's details
 */
export function useMaterialDetail(materialId: string, studentId: string) {
    const [material, setMaterial] = useState<LibraryMaterial | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMaterial = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Fetch all materials and find the one we need
                // In a real app, we'd have a dedicated API endpoint for this
                const allMaterials = await getLibraryMaterials({});
                const foundMaterial = allMaterials.find(m => m.id === materialId);

                if (!foundMaterial) {
                    throw new Error('Material not found');
                }

                // Enrich with student history
                const [enrichedMaterial] = await enrichWithStudentHistory([foundMaterial], studentId);
                setMaterial(enrichedMaterial || null);

            } catch (err) {
                console.error('Error fetching material detail:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch material');
                setMaterial(null);
            } finally {
                setIsLoading(false);
            }
        };

        if (materialId && studentId) {
            fetchMaterial();
        }
    }, [materialId, studentId]);

    return { material, isLoading, error };
}
