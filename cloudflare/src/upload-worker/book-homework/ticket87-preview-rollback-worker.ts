export default {
  async fetch(): Promise<Response> {
    return new Response(JSON.stringify({
      code: 'ticket87_preview_rollback_fail_closed',
      writable: false,
    }), {
      status: 503,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    });
  },
} satisfies ExportedHandler;
