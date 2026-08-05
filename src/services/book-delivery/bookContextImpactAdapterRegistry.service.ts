import { createBookContextAdapterRegistry } from './bookContextAdapterRegistry.service';
import { BOOK_CLASS_IMPACT_ADAPTER_DECLARATION } from './bookClassImpactAdapter.service';
import { BOOK_COURSE_IMPACT_ADAPTER_DECLARATION } from './bookCourseImpactAdapter.service';
import { BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION } from './bookPublicImpactAdapter.service';

/** 39D source-controlled declarations only; registration cannot activate reads or writes. */
export const createBookContextImpactAdapterRegistry = () => createBookContextAdapterRegistry([
  BOOK_COURSE_IMPACT_ADAPTER_DECLARATION,
  BOOK_CLASS_IMPACT_ADAPTER_DECLARATION,
  BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION,
]);
