/**
 * Route Constants Unit Tests
 * Tests for type-safe route building and parameter extraction
 */

import { describe, it, expect } from 'vitest';
import { ROUTES, buildRoute, extractParams, matchesRoute, type RouteName } from './routes';

describe('Route Constants', () => {
  describe('ROUTES Object', () => {
    it('should have all required routes defined', () => {
      expect(ROUTES.LOGIN).toBe('/');
      expect(ROUTES.TEACHER_LOBBY).toBe('/teacher-lobby/:sessionCode');
      expect(ROUTES.STUDENT_TEST).toBe('/student-test/:sessionCode');
      expect(ROUTES.SESSIONS).toBe('/sessions');
      expect(ROUTES.TEACHER_STUDENT_HISTORY).toBe('/teacher/student/:studentId/history');
      expect(ROUTES.RESULT_DETAIL).toBe('/result/:resultId');
      expect(ROUTES.TEACHER_READING_V2_CREATE).toBe('/teacher/reading-v2/create');
      expect(ROUTES.TEACHER_READING_V2_IMPORT).toBe('/teacher/reading-v2/import');
      expect(ROUTES.TEACHER_READING_V2_DRAFT).toBe('/teacher/reading-v2/drafts/:draftId');
      expect(ROUTES.TEACHER_READING_V2_REVISE).toBe('/teacher/reading-v2/materials/:materialId/revise');
    });

    it('should have consistent naming convention', () => {
      const routeNames = Object.keys(ROUTES);
      routeNames.forEach(name => {
        expect(name).toMatch(/^[A-Z0-9_]+$/); // All uppercase with underscores and numeric suffixes
      });
    });

    it('should have no duplicate paths', () => {
      const paths = Object.values(ROUTES);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(paths.length);
    });

    it('should use kebab-case for URL segments', () => {
      const paths = Object.values(ROUTES);
      paths.forEach(path => {
        const segments = path.split('/').filter(s => s && !s.startsWith(':'));
        segments.forEach(segment => {
          expect(segment).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        });
      });
    });
  });

  describe('buildRoute()', () => {
    describe('Basic Functionality', () => {
      it('should build route without parameters', () => {
        const path = buildRoute('LOGIN');
        expect(path).toBe('/');
      });

      it('should build route with single parameter', () => {
        const path = buildRoute('STUDENT_TEST', { sessionCode: 'ABC123' });
        expect(path).toBe('/student-test/ABC123');
      });

      it('should build route with multiple parameters', () => {
        const path = buildRoute('TEACHER_LOBBY', { sessionCode: 'XYZ789' });
        expect(path).toBe('/teacher-lobby/XYZ789');
      });

      it('should handle missing optional parameters gracefully', () => {
        const path = buildRoute('STUDENT_TEST');
        expect(path).toBe('/student-test/:sessionCode'); // Unchanged template
      });
    });

    describe('Parameter Handling', () => {
      it('should replace all parameter placeholders', () => {
        const path = buildRoute('TEACHER_TEST_MONITOR', { sessionCode: 'TEST123' });
        expect(path).toContain('TEST123');
        expect(path).not.toContain(':sessionCode');
      });

      it('should handle sessionCode parameter', () => {
        const path = buildRoute('STUDENT_WAITING', { gameSessionId: 'SESSION_456' });
        expect(path).toBe('/student-wait/SESSION_456');
      });

      it('should handle gameSessionId parameter', () => {
        const path = buildRoute('TEACHER_QUIZ', { gameSessionId: 'QUIZ_789' });
        expect(path).toBe('/teacher-quiz/QUIZ_789');
      });

      it('should handle resultId parameter', () => {
        const path = buildRoute('RESULT_DETAIL', { resultId: 'result-123' });
        expect(path).toBe('/result/result-123');
      });

      it('should handle teacher student history parameters', () => {
        const path = buildRoute('TEACHER_STUDENT_HISTORY', { studentId: 'student-123' });
        expect(path).toBe('/teacher/student/student-123/history');
      });

      it('should handle reading v2 draft parameters', () => {
        const path = buildRoute('TEACHER_READING_V2_DRAFT', { draftId: 'draft-123' });
        expect(path).toBe('/teacher/reading-v2/drafts/draft-123');
      });

      it('should handle reading v2 revise parameters', () => {
        const path = buildRoute('TEACHER_READING_V2_REVISE', { materialId: 'material-123' });
        expect(path).toBe('/teacher/reading-v2/materials/material-123/revise');
      });

      it('should ignore undefined parameter values', () => {
        const path = buildRoute('STUDENT_TEST', { sessionCode: undefined });
        expect(path).toBe('/student-test/:sessionCode');
      });

      it('should handle empty string parameters', () => {
        const path = buildRoute('STUDENT_TEST', { sessionCode: '' });
        expect(path).toBe('/student-test/');
      });

      it('should handle numeric parameters as strings', () => {
        const path = buildRoute('STUDENT_TEST', { sessionCode: '12345' });
        expect(path).toBe('/student-test/12345');
      });
    });

    describe('Edge Cases', () => {
      it('should handle special characters in parameters', () => {
        const path = buildRoute('STUDENT_TEST', { sessionCode: 'ABC-123_XYZ' });
        expect(path).toBe('/student-test/ABC-123_XYZ');
      });

      it('should handle URL-encoded characters', () => {
        const path = buildRoute('STUDENT_TEST', { sessionCode: 'TEST%20CODE' });
        expect(path).toBe('/student-test/TEST%20CODE');
      });

      it('should handle very long parameter values', () => {
        const longCode = 'A'.repeat(100);
        const path = buildRoute('STUDENT_TEST', { sessionCode: longCode });
        expect(path).toContain(longCode);
      });

      it('should handle extra parameters not in template', () => {
        // @ts-expect-error Testing runtime behavior with extra params
        const path = buildRoute('LOGIN', { unknownParam: 'value' });
        expect(path).toBe('/');
      });
    });

    describe('Type Safety', () => {
      it('should accept valid route names', () => {
        const routes: RouteName[] = [
          'LOGIN',
          'TEACHER_LOBBY',
          'STUDENT_TEST',
          'SESSIONS',
          'TEACHER_STUDENT_HISTORY',
          'RESULT_DETAIL',
          'TEACHER_READING_V2_CREATE',
          'TEACHER_READING_V2_IMPORT',
          'TEACHER_READING_V2_DRAFT',
          'TEACHER_READING_V2_REVISE',
        ];

        routes.forEach(route => {
          expect(() => buildRoute(route)).not.toThrow();
        });
      });

      it('should produce valid URL paths', () => {
        const path = buildRoute('TEACHER_TEST_RESULTS', { sessionCode: 'TEST' });
        expect(path).toMatch(/^\/[A-Za-z0-9_/-]+$/);
      });
    });

    describe('Real-World Scenarios', () => {
      it('should build student test URL correctly', () => {
        const sessionCode = 'S7AZXQ'; // Real session code format
        const path = buildRoute('STUDENT_TEST', { sessionCode });
        expect(path).toBe('/student-test/S7AZXQ');
      });

      it('should build teacher lobby URL correctly', () => {
        const sessionCode = 'ABC123';
        const path = buildRoute('TEACHER_LOBBY', { sessionCode });
        expect(path).toBe('/teacher-lobby/ABC123');
      });

      it('should build nested route URLs correctly', () => {
        const path = buildRoute('CREATE_TEST');
        expect(path).toBe('/create-test');
      });
    });
  });

  describe('extractParams()', () => {
    describe('Basic Extraction', () => {
      it('should extract single parameter from path', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/ABC123');
        expect(params).toEqual({ sessionCode: 'ABC123' });
      });

      it('should extract gameSessionId parameter', () => {
        const params = extractParams('STUDENT_WAITING', '/student-wait/SESSION_456');
        expect(params).toEqual({ gameSessionId: 'SESSION_456' });
      });

      it('should return null for non-matching paths', () => {
        const params = extractParams('STUDENT_TEST', '/wrong-path/ABC123');
        expect(params).toBeNull();
      });

      it('should return empty object for parameterless routes', () => {
        const params = extractParams('LOGIN', '/');
        expect(params).toEqual({});
      });
    });

    describe('Path Validation', () => {
      it('should reject paths with wrong segment count', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/ABC/extra');
        expect(params).toBeNull();
      });

      it('should reject paths with wrong base segments', () => {
        const params = extractParams('STUDENT_TEST', '/teacher-test/ABC123');
        expect(params).toBeNull();
      });

      it('should handle trailing slashes', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/ABC123/');
        expect(params).toBeNull(); // Extra segment
      });

      it('should handle missing leading slash', () => {
        const params = extractParams('STUDENT_TEST', 'student-test/ABC123');
        expect(params).toBeNull();
      });
    });

    describe('Parameter Extraction Accuracy', () => {
      it('should extract exact parameter values', () => {
        const sessionCode = 'XYZ-789_TEST';
        const path = `/student-test/${sessionCode}`;
        const params = extractParams('STUDENT_TEST', path);
        expect(params?.sessionCode).toBe(sessionCode);
      });

      it('should preserve special characters', () => {
        const sessionCode = 'TEST%20CODE';
        const path = `/student-test/${sessionCode}`;
        const params = extractParams('STUDENT_TEST', path);
        expect(params?.sessionCode).toBe(sessionCode);
      });

      it('should handle numeric parameter values', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/12345');
        expect(params?.sessionCode).toBe('12345');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty parameter segments', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/');
        expect(params).toBeNull(); // Missing required param
      });

      it('should handle very long parameter values', () => {
        const longCode = 'A'.repeat(100);
        const path = `/student-test/${longCode}`;
        const params = extractParams('STUDENT_TEST', path);
        expect(params?.sessionCode).toBe(longCode);
      });

      it('should handle paths with query strings', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/ABC123?foo=bar');
        expect(params).toBeNull(); // Query string adds extra segment
      });
    });

    describe('Real-World Scenarios', () => {
      it('should extract from actual student test URL', () => {
        const params = extractParams('STUDENT_TEST', '/student-test/S7AZXQ');
        expect(params).toEqual({ sessionCode: 'S7AZXQ' });
      });

      it('should extract from teacher lobby URL', () => {
        const params = extractParams('TEACHER_LOBBY', '/teacher-lobby/ABC123');
        expect(params).toEqual({ sessionCode: 'ABC123' });
      });

      it('should extract from quiz feedback URL', () => {
        const params = extractParams('TEACHER_FEEDBACK', '/teacher-feedback/GAME_789');
        expect(params).toEqual({ gameSessionId: 'GAME_789' });
      });

      it('should extract reading v2 draft params', () => {
        const params = extractParams('TEACHER_READING_V2_DRAFT', '/teacher/reading-v2/drafts/draft-123');
        expect(params).toEqual({ draftId: 'draft-123' });
      });

      it('should extract reading v2 revise params', () => {
        const params = extractParams(
          'TEACHER_READING_V2_REVISE',
          '/teacher/reading-v2/materials/material-123/revise',
        );
        expect(params).toEqual({ materialId: 'material-123' });
      });
    });
  });

  describe('matchesRoute()', () => {
    describe('Basic Matching', () => {
      it('should match exact static routes', () => {
        expect(matchesRoute('LOGIN', '/')).toBe(true);
        expect(matchesRoute('SESSIONS', '/sessions')).toBe(true);
      });

      it('should match parameterized routes', () => {
        expect(matchesRoute('STUDENT_TEST', '/student-test/ABC123')).toBe(true);
        expect(matchesRoute('TEACHER_LOBBY', '/teacher-lobby/XYZ789')).toBe(true);
      });

      it('should not match wrong routes', () => {
        expect(matchesRoute('STUDENT_TEST', '/teacher-test/ABC123')).toBe(false);
        expect(matchesRoute('LOGIN', '/sessions')).toBe(false);
      });
    });

    describe('Parameter Matching', () => {
      it('should match regardless of parameter value', () => {
        expect(matchesRoute('STUDENT_TEST', '/student-test/AAA')).toBe(true);
        expect(matchesRoute('STUDENT_TEST', '/student-test/BBB')).toBe(true);
        expect(matchesRoute('STUDENT_TEST', '/student-test/123')).toBe(true);
      });

      it('should match with special characters in parameters', () => {
        expect(matchesRoute('STUDENT_TEST', '/student-test/ABC-123')).toBe(true);
        expect(matchesRoute('STUDENT_TEST', '/student-test/TEST_CODE')).toBe(true);
      });
    });

    describe('Validation', () => {
      it('should reject paths with extra segments', () => {
        expect(matchesRoute('STUDENT_TEST', '/student-test/ABC/extra')).toBe(false);
      });

      it('should reject paths with missing segments', () => {
        expect(matchesRoute('STUDENT_TEST', '/student-test')).toBe(false);
      });

      it('should reject completely different paths', () => {
        expect(matchesRoute('STUDENT_TEST', '/completely/different')).toBe(false);
      });
    });

    describe('Real-World Usage', () => {
      it('should validate navigation targets', () => {
        const currentPath = '/student-test/ABC123';
        expect(matchesRoute('STUDENT_TEST', currentPath)).toBe(true);
        expect(matchesRoute('TEACHER_LOBBY', currentPath)).toBe(false);
      });

      it('should work with React Router location', () => {
        const location = { pathname: '/teacher-lobby/SESSION_XYZ' };
        expect(matchesRoute('TEACHER_LOBBY', location.pathname)).toBe(true);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should maintain consistency between build and extract', () => {
      const params = { sessionCode: 'TEST123' };
      const built = buildRoute('STUDENT_TEST', params);
      const extracted = extractParams('STUDENT_TEST', built);
      expect(extracted).toEqual(params);
    });

    it('should work in round-trip scenarios', () => {
      const routes: Array<{ route: RouteName; params: any }> = [
        { route: 'STUDENT_TEST', params: { sessionCode: 'ABC' } },
        { route: 'TEACHER_LOBBY', params: { sessionCode: 'XYZ' } },
        { route: 'STUDENT_WAITING', params: { gameSessionId: '123' } },
      ];

      routes.forEach(({ route, params }) => {
        const path = buildRoute(route, params);
        const extracted = extractParams(route, path);
        expect(extracted).toEqual(params);
      });
    });

    it('should validate built routes', () => {
      const params = { sessionCode: 'VALID' };
      const path = buildRoute('STUDENT_TEST', params);
      expect(matchesRoute('STUDENT_TEST', path)).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should build routes quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        buildRoute('STUDENT_TEST', { sessionCode: `TEST${i}` });
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // Should take < 100ms for 1000 builds
    });

    it('should extract params quickly', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        extractParams('STUDENT_TEST', `/student-test/TEST${i}`);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
