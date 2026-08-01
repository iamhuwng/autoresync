export default {
  async fetch(): Promise<Response> {
    // This worker is intentionally inert: every method and path remains unavailable
    // after rollback, including the former proof endpoint.
    return Response.json({
      code: 'ticket89_preview_rollback_fail_closed',
      commandAcceptance: 'disabled',
      writable: false,
      boundDataStores: 0,
    }, {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    });
  },
} satisfies ExportedHandler;
