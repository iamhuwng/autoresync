import React from 'react';
import { describe, expect, it } from 'vitest';
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

  it('redirects enabled Material Book editor navigation to Teacher Materials with modal-open route state', () => {
    const route = findRoute(
      createTeacherRoutes({
        exposeMaterialBookEditorRoutes: true,
        exposeReadingV2StudioRoutes: false,
      }),
      '/teacher/materials/books/:bookId',
    );
    const redirect = findElementByTypeName(route?.element, 'TeacherMaterialBookRedirect');

    expect(redirect?.props).toEqual({});
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
});
