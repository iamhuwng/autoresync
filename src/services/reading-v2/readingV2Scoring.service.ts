// Reading V2 scoring boundary: scores only versioned canonical snapshots and never calls legacy Reading heuristics.
export {
  scoreReadingV2Attempt,
  type ReadingV2SubmittedAnswerRecord,
  type ReadingV2SubmittedAnswerValue,
  type ReadingV2RuntimeSubmitSnapshot,
} from './readingV2ResultAdapter.service';
