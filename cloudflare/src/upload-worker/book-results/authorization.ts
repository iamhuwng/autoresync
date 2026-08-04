import type {
  BookHomeworkReadAuthority,
  BookResultAttemptSummary,
  BookResultQueryInput,
  BookResultReadScope,
  BookResultViewer,
  BookResultViewerRole,
} from './types.ts';

export interface BookResultViewerRoleResolverInput {
  readonly uid: string;
  readonly request: Request;
  readonly env: Readonly<Record<string, unknown>>;
}

export type BookResultViewerRoleResolution = BookResultViewerRole
  | BookResultViewer
  | { readonly role: BookResultViewerRole; readonly disabled?: boolean }
  | null;

export type BookResultViewerRoleResolver = (
  input: BookResultViewerRoleResolverInput,
) => Promise<BookResultViewerRoleResolution> | BookResultViewerRoleResolution;

export interface BookResultHomeworkAuthorityResolverInput {
  readonly viewerUid: string;
  readonly homeworkIds: readonly string[];
  readonly request: Request;
  readonly env: Readonly<Record<string, unknown>>;
}

export type BookResultHomeworkAuthorityResolution =
  | Readonly<Record<string, BookHomeworkReadAuthority | null>>
  | readonly (BookHomeworkReadAuthority | null)[];

export type BookResultHomeworkAuthorityResolver = (
  input: BookResultHomeworkAuthorityResolverInput,
) => Promise<BookResultHomeworkAuthorityResolution> | BookResultHomeworkAuthorityResolution;

export class BookResultVisibilityError extends Error {
  constructor(readonly code: string, readonly status = 403) {
    super(code);
    this.name = 'BookResultVisibilityError';
  }
}

const roleOf = (value: BookResultViewerRoleResolution): BookResultViewerRole | null => {
  if (value === 'student' || value === 'teacher') return value;
  if (value && typeof value === 'object' && (value.role === 'student' || value.role === 'teacher')) {
    if ('disabled' in value && value.disabled === true) return null;
    return value.role;
  }
  return null;
};

const authorityMap = (
  ids: readonly string[],
  value: BookResultHomeworkAuthorityResolution,
): Readonly<Record<string, BookHomeworkReadAuthority | null>> => {
  if (Array.isArray(value)) {
    return Object.fromEntries(ids.map((id, index) => [id, value[index] ?? null]));
  }
  return value as Readonly<Record<string, BookHomeworkReadAuthority | null>>;
};

const assertAuthority = (
  authority: BookHomeworkReadAuthority | null | undefined,
  uid: string,
  studentId: string,
): BookHomeworkReadAuthority => {
  if (!authority || authority.status !== 'current' || authority.ownerId !== uid
    || (authority.studentIds && !authority.studentIds.includes(studentId))) {
    throw new BookResultVisibilityError('book_result_homework_not_current_or_owned');
  }
  return authority;
};

export interface BookResultVisibilityContext {
  readonly viewer: BookResultViewer;
  readonly authorities: Readonly<Record<string, BookHomeworkReadAuthority | null>>;
}

/**
 * Resolves viewer role and Homework ownership once per request.  The caller
 * must provide trusted resolvers; request role/context fields are never read
 * as authority.  A teacher can only read a currently owned Homework scope,
 * while a student can only read a result addressed to their own UID.
 */
export const resolveBookResultVisibility = async (input: {
  readonly uid: string;
  readonly request: Request;
  readonly env: Readonly<Record<string, unknown>>;
  readonly scope: BookResultReadScope;
  readonly resolveViewerRole: BookResultViewerRoleResolver;
  readonly resolveHomeworkAuthorities: BookResultHomeworkAuthorityResolver;
}): Promise<BookResultVisibilityContext> => {
  const role = roleOf(await input.resolveViewerRole({
    uid: input.uid,
    request: input.request,
    env: input.env,
  }));
  if (!role) throw new BookResultVisibilityError('book_result_viewer_role_unavailable', 503);

  const homeworkIds = input.scope.homeworkId ? [input.scope.homeworkId] : [];
  const authorities = authorityMap(homeworkIds, await input.resolveHomeworkAuthorities({
    viewerUid: input.uid,
    homeworkIds,
    request: input.request,
    env: input.env,
  }));

  if (role === 'student') {
    if (input.scope.studentId !== input.uid) {
      throw new BookResultVisibilityError('book_result_student_owner_required');
    }
    if (input.scope.homeworkId) {
      assertAuthority(authorities[input.scope.homeworkId], input.uid, input.uid);
    }
  } else {
    if (!input.scope.homeworkId || input.scope.contextKind === 'solo') {
      throw new BookResultVisibilityError('book_result_teacher_homework_required');
    }
    assertAuthority(authorities[input.scope.homeworkId], input.uid, input.scope.studentId);
  }

  return {
    viewer: { uid: input.uid, role },
    authorities,
  };
};

export const assertBookResultVisible = (
  context: BookResultVisibilityContext,
  scope: BookResultQueryInput,
  summary: Pick<BookResultAttemptSummary, 'studentId' | 'surface' | 'homeworkId'>,
): void => {
  if (summary.studentId !== context.viewer.uid && context.viewer.role === 'student') {
    throw new BookResultVisibilityError('book_result_student_owner_required');
  }
  if (context.viewer.role === 'teacher') {
    if (summary.surface !== 'homework' || !summary.homeworkId || !scope.homeworkId
      || summary.homeworkId !== scope.homeworkId) {
      throw new BookResultVisibilityError('book_result_teacher_homework_required');
    }
    assertAuthority(
      context.authorities[summary.homeworkId],
      context.viewer.uid,
      summary.studentId,
    );
  }
  if (summary.surface !== 'solo' && summary.surface !== 'homework') {
    throw new BookResultVisibilityError('book_result_visibility_unresolved');
  }
}
