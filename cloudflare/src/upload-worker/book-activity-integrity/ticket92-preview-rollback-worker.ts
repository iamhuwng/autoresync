export default {
  async fetch(): Promise<Response> {
    return Response.json({
      code: 'ticket92_preview_rollback_hidden',
      report: 'hidden',
      reportRoute: 'disabled',
      linkage: 'disabled',
      attempts: 'preserved',
      results: 'preserved',
      signals: 'preserved',
      academicOutcomes: 'preserved',
      submissionAvailable: true,
      gradingAvailable: true,
      completionAvailable: true,
      writable: false,
    }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  },
} satisfies ExportedHandler;
