import { describe, expect, it } from 'vitest';
import { FEATURE_REGISTRY } from '../../src/config/featureRegistry';
import activationConfig from '../wrangler.prd0062-ticket126-vocab-u1-activation.jsonc?raw';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest.ts';

describe('#126 route and observability registry consistency', () => {
  it('binds enabled source upload routes to the production control origin', () => {
    expect(activationConfig).toContain('"BOOK_SOURCE_UPLOAD_ROUTES_ENABLED": "enabled"');
    expect(activationConfig).toContain(
      '"BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN": "https://kahut1.web.app"',
    );
  });

  it('keeps every canonical mutating book route disabled by default', () => {
    const mutating = canonicalBookRouteManifest.filter((route) =>
      route.methods.some((method) => !['GET', 'HEAD'].includes(method)));
    expect(mutating.length).toBeGreaterThan(0);
    expect(mutating.every((route) => route.gateDefault === 'disabled')).toBe(true);
    expect(mutating.every((route) => /^BOOK_[A-Z0-9_]+_ROUTES_ENABLED$/u.test(route.gateEnv))).toBe(true);
  });

  it('keeps update and replacement paths as disabled future seams', () => {
    const seams = canonicalBookRouteManifest.filter((route) =>
      route.id === 'book.updates.command' || route.id === 'book.replacement-cleanup.command');
    expect(seams).toHaveLength(2);
    expect(seams.every((route) => route.source === 'future-seam' && route.gateDefault === 'disabled')).toBe(true);
    expect(seams.map((route) => route.handler)).toEqual([
      'futureSeam.updateCommand',
      'futureSeam.replacementCleanupCommand',
    ]);
  });

  it('maps existing user-facing pilot workflows to the existing feature registry', () => {
    const actions = new Set(FEATURE_REGISTRY.flatMap((feature) => feature.actions));
    for (const action of [
      'teacher_materials_book_created',
      'teacher_materials_book_updated',
      'book_source_upload_started',
      'assignHomework',
      'launchBookRuntime',
    ]) {
      expect(actions.has(action), action).toBe(true);
    }
  });
});
