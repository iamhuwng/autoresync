import type { BookRouteHandlerMap } from '../book-route-handlers.ts';
import { FirebaseRestBookImpactSnapshotRepository } from './impact-snapshot-repository.ts';
import { createBookImpactSnapshotReadHandler } from './impact-snapshot-read.ts';
import { FirebaseRestBookUpdateActionRepository } from './update-action-repository.ts';
import { createBookUpdateActionService } from './update-action.ts';
import { createBookUpdateActionCommandHandler } from './update-action-command.ts';

const unavailable = (): Response => new Response(JSON.stringify({ code: 'book_update_authority_unavailable' }), {
  status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** The registered routes reuse the durable snapshot/action owners; accepting intent does not apply it. */
export const createProductionBookUpdateHandlers = (): BookRouteHandlerMap => ({
  'futureSeam.impactSnapshotRead': async (input) => {
    try {
      return await createBookImpactSnapshotReadHandler({
        repository: new FirebaseRestBookImpactSnapshotRepository({ env: input.env }),
      })(input);
    } catch { return unavailable(); }
  },
  'futureSeam.updateCommand': async (input) => {
    try {
      return await createBookUpdateActionCommandHandler(createBookUpdateActionService({
        snapshots: new FirebaseRestBookImpactSnapshotRepository({ env: input.env }),
        actions: new FirebaseRestBookUpdateActionRepository({ env: input.env }),
      }))(input);
    } catch { return unavailable(); }
  },
});
