import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { studentRoutes } from './studentRoutes';

const findRoute = (path: string) =>
  studentRoutes.find((route) => route.path === path);

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

describe('studentRoutes', () => {
  it('routes dedicated student Quiz URLs to retirement notice without importing Quiz gameplay', () => {
    const route = findRoute('/student-quiz/:gameSessionId');
    const notice = findElementByTypeName(route?.element, 'RetiredMaterialNoticePage');
    const source = readFileSync(resolve('src/routes/studentRoutes.tsx'), 'utf8');

    expect(notice?.props).toMatchObject({
      audience: 'student',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(route?.element, 'PrivateRoute')?.props.allowedRoles).toEqual([
      'student',
    ]);
    expect(source).not.toContain('StudentQuizPage');
    expect(source).not.toContain("import('../pages/StudentQuizPageNew.jsx')");
  });

  it('routes legacy student Quiz feedback/result URLs to retirement notice', () => {
    const feedbackRoute = findRoute('/student-feedback/:gameSessionId');
    const resultRoute = findRoute('/student-results/:gameSessionId');
    const source = readFileSync(resolve('src/routes/studentRoutes.tsx'), 'utf8');

    expect(findElementByTypeName(feedbackRoute?.element, 'RetiredMaterialNoticePage')?.props).toMatchObject({
      audience: 'student',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(resultRoute?.element, 'RetiredMaterialNoticePage')?.props).toMatchObject({
      audience: 'student',
      retiredFeature: 'quiz',
    });
    expect(findElementByTypeName(feedbackRoute?.element, 'PrivateRoute')?.props.allowedRoles)
      .toEqual(['student']);
    expect(findElementByTypeName(resultRoute?.element, 'PrivateRoute')?.props.allowedRoles)
      .toEqual(['student']);
    expect(source).not.toContain('StudentFeedbackPage');
    expect(source).not.toContain('StudentResultsPage');
  });

  it('routes generic unavailable material URLs to the student notice without retired source reads', () => {
    const route = findRoute('/material-unavailable/:materialId');
    const notice = findElementByTypeName(route?.element, 'RetiredMaterialNoticePage');

    expect(notice?.props).toMatchObject({
      audience: 'student',
      retiredFeature: 'material',
    });
    expect(findElementByTypeName(route?.element, 'PrivateRoute')?.props.allowedRoles)
      .toEqual(['student']);
  });
});
