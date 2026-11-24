import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/modern/Button';
import './ExternalAudioStorage.css';

export function PublicListeningAudioWarning({ onClose }: { onClose: (confirmed: boolean) => void }) {
    const id = useId();
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (!dialog.current?.open) dialog.current?.showModal();
    }, []);

    return <dialog ref={dialog} className="external-audio-dialog" aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`} onClose={(event) => {
            const confirmed = event.currentTarget.returnValue === 'publish';
            event.currentTarget.returnValue = '';
            onClose(confirmed);
        }}>
        <h4 id={`${id}-title`}>Publish with external audio?</h4>
        <p id={`${id}-description`}>
            This test depends on the selected recording version and your Backblaze connection.
            Signed-in students and students assigned by other teachers stream from your bucket.
            This uses your Backblaze bandwidth and may incur charges. Playback requires the
            recording version and connection to remain available.
        </p>
        <form method="dialog" className="external-audio-controls">
            <Button type="submit" variant="outline" value="cancel" autoFocus>Keep editing</Button>
            <Button type="submit" value="publish">Publish public test</Button>
        </form>
    </dialog>;
}
