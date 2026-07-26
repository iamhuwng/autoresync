import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const createPdf = (pageCount = 2) => {
  const contentObjectId = pageCount + 3;
  const objectBodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from(
      { length: pageCount },
      (_, index) => `${index + 3} 0 R`,
    ).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <<>> /Contents ${contentObjectId} 0 R >>`,
    ),
    '<< /Length 1 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.7\n%PRD0062-TICKET06B\n';
  const offsets = [0];
  objectBodies.forEach((objectBody, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objectBodies.length + 1}\n`;
  body += '0000000000 65535 f \n';
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const target = resolve(
    process.argv[2] ?? 'artifacts/prd0062-ticket-06b/browser/upload-fixture.pdf',
  );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, createPdf());
  process.stdout.write(`${target}\n`);
}
