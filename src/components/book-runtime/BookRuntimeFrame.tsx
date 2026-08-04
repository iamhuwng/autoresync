import type { ActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import { ActivityRendererHost } from './interactions/ActivityRendererHost';
import type { BookRuntimeFrameViewModel } from './bookRuntimeFrame.types';

export interface BookRuntimeFrameProps {
  registry: ActivityRendererRegistry;
  viewModel: BookRuntimeFrameViewModel;
  /** Embedded hosts avoid nesting the runtime landmark inside another page main. */
  as?: 'main' | 'section';
}

export const BookRuntimeFrame = ({ registry, viewModel, as: Root = 'main' }: BookRuntimeFrameProps) => (
  <Root aria-labelledby="book-runtime-title">
    <header>
      <h1 id="book-runtime-title">{viewModel.title}</h1>
    </header>
    <ActivityRendererHost
      context={viewModel.activity.context}
      onResponseChange={viewModel.activity.onResponseChange}
      projection={viewModel.activity.projection}
      registry={registry}
      responses={viewModel.activity.responses}
      validationByInteractionId={viewModel.activity.validationByInteractionId}
    />
    <nav aria-label="Book activity navigation">
      {viewModel.previous ? (
        <button disabled={viewModel.previous.disabled} onClick={viewModel.previous.onActivate} type="button">
          {viewModel.previous.label}
        </button>
      ) : null}
      {viewModel.next ? (
        <button disabled={viewModel.next.disabled} onClick={viewModel.next.onActivate} type="button">
          {viewModel.next.label}
        </button>
      ) : null}
    </nav>
  </Root>
);
