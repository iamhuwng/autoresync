export default {
  async fetch(): Promise<Response> {
    return Response.json({
      code: 'ticket90_preview_rollback_hidden',
      teacherPresentation: 'hidden',
      studentEvaluation: {
        status: 'hidden',
      },
      evaluationHistory: 'preserved',
      submissions: 'preserved',
      writable: false,
      boundDataStores: 0,
    }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  },
} satisfies ExportedHandler;
