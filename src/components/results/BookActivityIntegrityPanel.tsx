import React from 'react';
import {
  BookIntegrityReportBrowserError,
  createBookIntegrityReportBrowserClient,
  type BookIntegrityReportBrowserClient,
  type BookIntegrityReportBrowserLocator,
} from '../../services/book-activity/bookIntegrityReport.browser';
import type { BookIntegrityReport } from '../../services/book-activity/bookIntegrityReport.types';
import { BookActivityIntegrityDetailPanel } from '../test/IntegrityDetailPanel';
import './BookActivityIntegrityPanel.css';

export interface BookActivityIntegrityPanelProps {
  readonly locator: BookIntegrityReportBrowserLocator;
  readonly studentName: string;
  readonly activityLabel: string;
  readonly client?: BookIntegrityReportBrowserClient;
  readonly onClose?: () => void;
  readonly onAction?: (
    action: 'bookActivityIntegrityLoaded' | 'bookActivityIntegrityRetried',
    metadata: Record<string, unknown>,
  ) => void;
}

const visibleError = (error: unknown): string => {
  if (error instanceof BookIntegrityReportBrowserError) {
    if (error.code === 'unauthorized' || error.code === 'forbidden') {
      return 'You no longer have permission to view this integrity report.';
    }
    if (error.code === 'not_found') return 'This submitted Activity has no available integrity report.';
    if (error.code === 'route_disabled') return 'Integrity review is temporarily unavailable.';
  }
  return 'The integrity report could not be loaded. Try again.';
};

const locatorIdentity = (locator: BookIntegrityReportBrowserLocator): string => JSON.stringify([
  locator.bookId,
  locator.terminalId,
  locator.attemptId ?? null,
]);

const BookActivityIntegrityPanelContent: React.FC<BookActivityIntegrityPanelProps> = ({
  locator,
  studentName,
  activityLabel,
  client: clientOverride,
  onClose,
  onAction,
}) => {
  const [client] = React.useState<BookIntegrityReportBrowserClient | null>(() => {
    if (clientOverride) return clientOverride;
    try {
      return createBookIntegrityReportBrowserClient();
    } catch {
      return null;
    }
  });
  const [report, setReport] = React.useState<BookIntegrityReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const onActionRef = React.useRef(onAction);
  onActionRef.current = onAction;

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!client) {
      setLoading(false);
      setError('Integrity review is temporarily unavailable.');
      return undefined;
    }
    void client.readTeacherReport(locator).then((next) => {
      if (!active) return;
      setReport(next);
      onActionRef.current?.('bookActivityIntegrityLoaded', {
        activityId: next.terminal.activityId,
        totalEventCount: next.totalEventCount,
        risk: next.risk,
      });
    }).catch((loadError: unknown) => {
      if (active) setError(visibleError(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [client, locator, retry]);

  const retryLoad = React.useCallback(() => {
    onAction?.('bookActivityIntegrityRetried', {
      terminalId: locator.terminalId,
    });
    setRetry((value) => value + 1);
  }, [locator.terminalId, onAction]);

  if (loading && !report) {
    return (
      <section className="book-integrity-panel" aria-label={`Integrity review for ${activityLabel}`}>
        <p className="book-integrity-panel__state" role="status">Loading post-submit integrity report...</p>
      </section>
    );
  }

  if (error && !report) {
    return (
      <section className="book-integrity-panel" aria-label={`Integrity review for ${activityLabel}`}>
        <div className="book-integrity-panel__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={retryLoad}>Try again</button>
        </div>
      </section>
    );
  }

  if (!report) return null;
  return (
    <div className="book-integrity-panel">
      <BookActivityIntegrityDetailPanel
        report={report}
        studentName={studentName}
        activityLabel={activityLabel}
        onClose={onClose}
      />
      {error ? <p className="book-integrity-panel__refresh-error" role="alert">{error}</p> : null}
    </div>
  );
};

export const BookActivityIntegrityPanel: React.FC<BookActivityIntegrityPanelProps> = (props) => (
  <BookActivityIntegrityPanelContent
    key={locatorIdentity(props.locator)}
    {...props}
  />
);

export default BookActivityIntegrityPanel;
