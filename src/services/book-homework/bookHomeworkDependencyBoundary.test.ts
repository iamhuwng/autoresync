import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const servicePath = resolve(dirname(fileURLToPath(import.meta.url)), 'bookHomeworkManifest.service.ts');

describe('Ticket 33A Book Homework dependency boundary', () => {
  it('keeps manifest logic typed and behind Book Delivery facts', () => {
    const source = readFileSync(servicePath, 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:firebase|firestore|cloudflare|book-assembly|repository|worker)[^'"]*['"]/iu);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\s*\(/u);
    expect(source).not.toMatch(/(?:Record<string,\s*any>|:\s*any\b|as\s+any\b)/u);
    expect(source).toMatch(/BookRuntimeDeliveryProjection/u);
    expect(source).toMatch(/BookHomeworkManifest/u);
  });
});
