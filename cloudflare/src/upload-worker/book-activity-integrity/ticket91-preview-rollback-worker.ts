const headers = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
} as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({
      code: 'ticket91_preview_capture_disabled',
      capture: 'disabled',
      completionAvailable: true,
      submissionAvailable: true,
      recordedSignals: 'preserved',
      canonicalLogsWritable: false,
      boundDataStores: 0,
    }, { status: 503, headers });
  },
} satisfies ExportedHandler;
