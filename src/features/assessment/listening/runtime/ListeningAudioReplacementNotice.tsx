import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../../../../services/firebase';

export function ListeningAudioReplacementNotice({ replaced, testId, recordedAt }: { replaced?: boolean; testId?: string; recordedAt?: number }) {
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    setChanged(false);
    if (!testId || !Number.isFinite(recordedAt)) return;
    return onValue(ref(database, `tests/${testId}/audioReplacedAt`), snapshot => {
      const at = snapshot.val();
      setChanged(typeof at === 'number' && at > recordedAt!);
    }, error => console.warn('Recording replacement status is unavailable:', error.code));
  }, [testId, recordedAt]);
  return replaced || changed ? <small role="note" style={{ display: 'block', color: '#92400e', fontSize: 12, lineHeight: 1.4 }}>
    The original recording was replaced. Earlier answers or results may not match this recording.
  </small> : null;
}
