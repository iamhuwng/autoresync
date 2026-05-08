export const APP_DOCUMENT_TITLE = 'MySTUdent Workspace';

export function formatDocumentTitle(pageTitle?: string | null): string {
  const normalizedPageTitle = pageTitle?.trim();

  return normalizedPageTitle
    ? `${normalizedPageTitle} | ${APP_DOCUMENT_TITLE}`
    : APP_DOCUMENT_TITLE;
}
