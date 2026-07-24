import React from 'react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createTeacherRoutes,
  TEACHER_MATERIALS_BOOK_EDITOR_DISABLED_NOTICE,
} from './teacherRoutes';

const routePaths = (routes: ReturnType<typeof createTeacherRoutes>) =>
  routes.map((route) => route.path);
const findRoute = (routes: ReturnType<typeof createTeacherRoutes>, path: string) =>
  routes.find((route) => route.path === path);
const findElementByTypeName = (
  node: React.ReactNode,
  typeName: string,
): React.ReactElement | null => {
  if (!React.isValidElement(node)) {
    return null;
  }

  const elementType = node.type;
  const elementTypeName = typeof elementType === 'string' ? elementType : elementType.name;

  if (elementTypeName === typeName) {
    return node;
  }

  return React.Children.toArray(node.props.children)
    .map((child) => findElementByTypeName(child, typeName))
    .find((element): element is React.ReactElement => Boolean(element)) ?? null;
};

describe('teacherRoutes', () => {
  it('keeps the Material Book editor route behind PRD-0052 capabilities', () => {
    expect(routePaths(createTeacherRoutes({
      exposeMaterialBookEditorRoutes: false,
      exposeReadingV2StudioRoutes: false,
    }))).toContain('/teacher/materials/books/:bookId');

    expect(routePaths(createTeacherRoutes({
      exposeMaterialBookEditorRoutes: true,
      exposeReadingV2StudioRoutes: false,
    }))).toContain('/teacher/materials/books/:bookId');
  });

  it('mounts the persisted-mode Book editor resolver directly for enabled navigation', () => {
    const route = findRoute(
      createTeacherRoutes({
        exposeMaterialBookEditorRoutes: true,
        exposeReadingV2StudioRoutes: false,
      }),
      '/teacher/materials/books/:bookId',
    );
    const redirect = findElementByTypeName(route?.element, 'TeacherMaterialBookRedirect');

    expect(redirect?.props).toEqual({});
    expect(findElementByTypeName(route?.element, 'Navigate')).toBeNull();
  });

  it('redirects disabled Material Book editor navigation to Teacher Materials with a visible notice state', () => {
    const route = findRoute(
      createTeacherRoutes({
        exposeMaterialBookEditorRoutes: false,
        exposeReadingV2StudioRoutes: false,
      }),
      '/teacher/materials/books/:bookId',
    );
    const redirect = findElementByTypeName(route?.element, 'Navigate');

    expect(redirect?.props).toMatchObject({
      to: '/lobby',
      replace: true,
      state: { teacherMaterialsNotice: TEACHER_MATERIALS_BOOK_EDITOR_DISABLED_NOTICE },
    });
  });

  it('routes dedicated teacher Quiz URLs to retirement notice without importing Quiz gameplay', () => {
    const route = findRoute(
      createTeacherRoutes({
        exposeMaterialBookEditorRoutes: false,
        exposeReadingV2StudioRoutes: false,
      }),
      '/teacher-quiz/:gameSessionId',
    );
    const notice = findElementByTypeName(route?.element, 'RetiredMaterialNoticePage');
    const source = readFileSync(resolve('src/routes/teacherRoutes.tsx'), 'utf8');

    expect(notice?.props).toMatchObject({
      audience: 'teacher',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(route?.element, 'PrivateRoute')?.props.allowedRoles).toEqual([
      'teacher',
      'super_admin',
    ]);
    expect(source).not.toContain('TeacherQuizPage');
    expect(source).not.toContain("import('../pages/TeacherQuizPage.jsx')");
    expect(source).not.toContain('TeacherWaitingRoomPage');
    expect(source).not.toContain("import('../pages/TeacherWaitingRoomPage.jsx')");
  });

  it('routes legacy teacher Quiz waiting URLs to retirement notice without importing Quiz waiting room', () => {
    const route = findRoute(
      createTeacherRoutes({
        exposeMaterialBookEditorRoutes: false,
        exposeReadingV2StudioRoutes: false,
      }),
      '/teacher-wait/:gameSessionId',
    );
    const notice = findElementByTypeName(route?.element, 'RetiredMaterialNoticePage');

    expect(notice?.props).toMatchObject({
      audience: 'teacher',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(route?.element, 'PrivateRoute')?.props.allowedRoles).toEqual([
      'teacher',
      'super_admin',
    ]);
  });

  it('routes legacy teacher Quiz feedback/result URLs to retirement notice', () => {
    const routes = createTeacherRoutes({
      exposeMaterialBookEditorRoutes: false,
      exposeReadingV2StudioRoutes: false,
    });
    const feedbackRoute = findRoute(routes, '/teacher-feedback/:gameSessionId');
    const resultRoute = findRoute(routes, '/teacher-results/:gameSessionId');
    const source = readFileSync(resolve('src/routes/teacherRoutes.tsx'), 'utf8');

    expect(findElementByTypeName(feedbackRoute?.element, 'RetiredMaterialNoticePage')?.props).toMatchObject({
      audience: 'teacher',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(resultRoute?.element, 'RetiredMaterialNoticePage')?.props).toMatchObject({
      audience: 'teacher',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(feedbackRoute?.element, 'PrivateRoute')?.props.allowedRoles)
      .toEqual(['teacher', 'super_admin']);
    expect(findElementByTypeName(resultRoute?.element, 'PrivateRoute')?.props.allowedRoles)
      .toEqual(['teacher', 'super_admin']);
    expect(source).not.toContain('TeacherFeedbackPage');
    expect(source).not.toContain('TeacherResultsPage');
  });

  it('routes generic unavailable material URLs to the teacher notice without retired source reads', () => {
    const route = findRoute(
      createTeacherRoutes({
        exposeMaterialBookEditorRoutes: false,
        exposeReadingV2StudioRoutes: false,
      }),
      '/material-unavailable/:materialId',
    );
    const notice = findElementByTypeName(route?.element, 'RetiredMaterialNoticePage');

    expect(notice?.props).toMatchObject({
      audience: 'teacher',
      retiredFeature: 'material',
    });
    expect(findElementByTypeName(route?.element, 'PrivateRoute')?.props.allowedRoles)
      .toEqual(['teacher', 'super_admin']);
  });
});
