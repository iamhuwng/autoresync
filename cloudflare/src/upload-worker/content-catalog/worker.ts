import type {
  ContentCatalog,
  ContentCatalogRequestContext,
} from '../../../../src/services/materialCatalog/contentCatalog.service';
import type { ContentCatalogSelection } from '../../../../src/types/materialCatalog.types';

const MAX_BODY_BYTES = 16 * 1024;
const SAFE_ERROR_CODES = new Set([
  'body_too_large',
  'catalog_is_not_selection',
  'content_type_required',
  'invalid_actor_id',
  'invalid_request',
  'invalid_selection',
  'launch_not_authorized',
  'preview_not_authorized',
  'selection_kind_mismatch',
  'selection_not_found',
]);

export interface ContentCatalogWorkerDependencies {
  readonly catalog: ContentCatalog;
  readonly verifyAuthorizationHeader: (
    authorization: string | null,
  ) => Promise<{ readonly valid: boolean; readonly uid?: string }>;
  readonly readUserRole: (uid: string) => Promise<unknown>;
}

const response = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

const isTeacher = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const role = (value as { role?: unknown }).role;
  return role === 'teacher' || role === 'super_admin';
};

const parseBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('content_type_required');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('body_too_large');
  const body = JSON.parse(text) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_request');
  return body as Record<string, unknown>;
};

export const handleContentCatalogRequest = async (
  request: Request,
  dependencies: ContentCatalogWorkerDependencies,
): Promise<Response> => {
  if (request.method !== 'POST') return response({ code: 'method_not_allowed' }, 405);
  const verified = await dependencies.verifyAuthorizationHeader(
    request.headers.get('authorization'),
  );
  if (!verified.valid || !verified.uid) return response({ code: 'unauthorized' }, 401);
  if (!isTeacher(await dependencies.readUserRole(verified.uid))) {
    return response({ code: 'teacher_required' }, 403);
  }

  try {
    const body = await parseBody(request);
    const intent = body.intent as ContentCatalogRequestContext['intent'];
    if (intent !== undefined && intent !== 'browse' && intent !== 'preview' && intent !== 'launch') {
      return response({ code: 'invalid_intent' }, 400);
    }
    const context = { actorId: verified.uid, intent };
    if (body.action === 'browse' && Object.keys(body).every((key) =>
      ['action', 'container', 'intent'].includes(key))) {
      return response({
        items: await dependencies.catalog.browseChildren(
          body.container as ContentCatalogSelection,
          context,
        ),
      });
    }
    if (body.action === 'resolve' && Object.keys(body).every((key) =>
      ['action', 'selection', 'intent'].includes(key))) {
      return response({
        item: await dependencies.catalog.resolveSelection(
          body.selection as ContentCatalogSelection,
          context,
        ),
      });
    }
    return response({ code: 'invalid_request' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = SAFE_ERROR_CODES.has(message) ? message : 'content_catalog_failed';
    const status = code === 'content_catalog_failed'
      ? 503
      : code.endsWith('_not_authorized') ? 403 : 400;
    return response({ code }, status);
  }
};
