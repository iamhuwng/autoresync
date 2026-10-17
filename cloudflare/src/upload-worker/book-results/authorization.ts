import type {
  BookHomeworkReadAuthority,
  BookResultAttemptSummary,
  BookResultGroupSummary,
  BookResultContextKind,
  BookResultQueryInput,
  BookResultReadScope,
  BookResultViewer,
  BookResultViewerRole,
  BookResultContextReadAuthority,
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
  readonly bookId: string;
  readonly studentId: string;
  readonly homeworkId?: string;
  readonly contextKind?: BookResultContextKind;
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
  homeworkId: string,
  studentId: string,
  bookId: string,
  requireOwner: boolean,
): BookHomeworkReadAuthority => {
  if (!authority || authority.homeworkId !== homeworkId || authority.bookId !== bookId
    || authority.status !== 'current' || (requireOwner && authority.ownerId !== uid)
    || !Array.isArray(authority.studentIds) || !authority.studentIds.includes(studentId)) {
    throw new BookResultVisibilityError('book_result_homework_not_current_or_owned');
  }
  return authority;
};

export interface BookResultVisibilityContext {
  readonly viewer: BookResultViewer;
  readonly authorities: Readonly<Record<string, BookHomeworkReadAuthority | null>>;
  readonly contextAuthority?: BookResultContextReadAuthority;
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
  readonly resolveContextAuthority?: (scope: BookResultReadScope) => Promise<BookResultContextReadAuthority | null>;
}): Promise<BookResultVisibilityContext> => {
  const role = roleOf(await input.resolveViewerRole({
    uid: input.uid,
    request: input.request,
    env: input.env,
  }));
  if (!role) throw new BookResultVisibilityError('book_result_viewer_role_unavailable', 503);
  if (input.scope.contextKind === 'public' || input.scope.contextKind === 'course' || input.scope.contextKind === 'class') {
    const authority = await input.resolveContextAuthority?.(input.scope);
    if ((input.scope.contextKind === 'public' && role !== 'student') || !authority || authority.contextKind !== input.scope.contextKind
      || authority.contextId !== input.scope.contextId || authority.bookId !== input.scope.bookId
      || authority.studentId !== input.scope.studentId
      || (role === 'student' ? input.uid !== authority.studentId : input.uid !== authority.ownerId)) {
      throw new BookResultVisibilityError('book_result_context_not_current_or_owned');
    }
    return { viewer: { uid: input.uid, role }, authorities: {}, contextAuthority: authority };
  }

  const homeworkIds = input.scope.homeworkId ? [input.scope.homeworkId] : [];
  const authorities = authorityMap(homeworkIds, await input.resolveHomeworkAuthorities({
    viewerUid: input.uid,
    bookId: input.scope.bookId,
    studentId: input.scope.studentId,
    ...(input.scope.homeworkId ? { homeworkId: input.scope.homeworkId } : {}),
    ...(input.scope.contextKind ? { contextKind: input.scope.contextKind } : {}),
    homeworkIds,
    request: input.request,
    env: input.env,
  }));

  if (role === 'student') {
    if (input.scope.studentId !== input.uid) {
      throw new BookResultVisibilityError('book_result_student_owner_required');
    }
    if (input.scope.homeworkId) {
      assertAuthority(
        authorities[input.scope.homeworkId],
        input.uid,
        input.scope.homeworkId,
        input.uid,
        input.scope.bookId,
        false,
      );
    }
  } else {
    if (!input.scope.homeworkId || input.scope.contextKind === 'solo') {
      throw new BookResultVisibilityError('book_result_teacher_homework_required');
    }
    assertAuthority(
      authorities[input.scope.homeworkId],
      input.uid,
      input.scope.homeworkId,
      input.scope.studentId,
      input.scope.bookId,
      true,
    );
  }

  return {
    viewer: { uid: input.uid, role },
    authorities,
  };
};

export const assertBookResultVisible = (
  context: BookResultVisibilityContext,
  scope: BookResultQueryInput,
  summary: Pick<BookResultAttemptSummary, 'bookId' | 'studentId' | 'surface' | 'homeworkId' | 'contextId'>,
): void => {
  if (summary.bookId !== scope.bookId || summary.studentId !== scope.studentId) {
    throw new BookResultVisibilityError('book_result_visibility_unresolved');
  }
  if (scope.homeworkId !== undefined && summary.homeworkId !== scope.homeworkId) {
    throw new BookResultVisibilityError('book_result_visibility_unresolved');
  }
  if (context.viewer.role === 'student' && summary.studentId !== context.viewer.uid) {
    throw new BookResultVisibilityError('book_result_student_owner_required');
  }
  if (scope.contextKind && summary.surface !== scope.contextKind) {
    throw new BookResultVisibilityError('book_result_visibility_unresolved');
  }
  if (context.contextAuthority) {
    if (summary.surface !== context.contextAuthority.contextKind || summary.contextId !== context.contextAuthority.contextId
      || summary.homeworkId) throw new BookResultVisibilityError('book_result_visibility_unresolved');
    return;
  }
  if (context.viewer.role === 'teacher') {
    if (summary.surface !== 'homework' || !summary.homeworkId || !scope.homeworkId
      || summary.homeworkId !== scope.homeworkId) {
      throw new BookResultVisibilityError('book_result_teacher_homework_required');
    }
    assertAuthority(
      context.authorities[summary.homeworkId],
      context.viewer.uid,
      summary.homeworkId,
      summary.studentId,
      scope.bookId,
      true,
    );
  }
  if (summary.surface !== 'solo' && summary.surface !== 'homework') {
    throw new BookResultVisibilityError('book_result_visibility_unresolved');
  }
}

/** Group indexes have no single surface field; authorize every indexed context. */
export const assertBookResultGroupVisible = (
  context: BookResultVisibilityContext,
  scope: BookResultQueryInput,
  group: Pick<BookResultGroupSummary, 'bookId' | 'studentId' | 'homeworkId' | 'contexts'>,
): void => {
  const invalidIdentity = group.bookId !== scope.bookId
    || group.studentId !== scope.studentId
    || group.contexts.length === 0;
  if (context.contextAuthority) {
    if (invalidIdentity || group.homeworkId || group.contexts.some((entry) => (
      entry.surface !== context.contextAuthority!.contextKind || entry.contextId !== context.contextAuthority!.contextId
    ))) throw new BookResultVisibilityError('book_result_visibility_unresolved');
    return;
  }
  const invalidHomework = scope.homeworkId
    ? group.homeworkId !== scope.homeworkId
      || group.contexts.some((entry) => entry.surface !== 'homework' || entry.contextId !== scope.homeworkId)
    : group.homeworkId !== undefined
      || group.contexts.some((entry) => entry.surface !== 'solo');
  if (invalidIdentity || invalidHomework) {
    throw new BookResultVisibilityError('book_result_visibility_unresolved');
  }
  if (context.viewer.role === 'student' && group.studentId !== context.viewer.uid) {
    throw new BookResultVisibilityError('book_result_student_owner_required');
  }
  if (context.viewer.role === 'teacher') {
    if (!scope.homeworkId) throw new BookResultVisibilityError('book_result_teacher_homework_required');
    assertAuthority(
      context.authorities[scope.homeworkId],
      context.viewer.uid,
      scope.homeworkId,
      group.studentId,
      scope.bookId,
      true,
    );
  }
};
