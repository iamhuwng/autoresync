import { Button } from '../modern';
import './HomeworkBulkActionBar.css';

interface HomeworkBulkActionBarProps {
    selectedCount: number;
    onExtend: () => void;
    onClose: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onDeselectAll: () => void;
    onCloseAllPastDue: () => void;
}

export function HomeworkBulkActionBar({
    selectedCount,
    onExtend,
    onClose,
    onDelete,
    onDuplicate,
    onDeselectAll,
    onCloseAllPastDue,
}: HomeworkBulkActionBarProps) {
    return (
        <div className="homework-bulk-action-bar" role="region" aria-label="Homework bulk actions">
            <div className="homework-bulk-action-bar__inner">
                <div className="homework-bulk-action-bar__summary">
                    <span className="homework-bulk-action-bar__label">Bulk actions</span>
                    <span className="homework-bulk-action-bar__count">{selectedCount} selected</span>
                </div>

                <div className="homework-bulk-action-bar__actions">
                    <Button variant="outline" size="sm" onClick={onExtend}>
                        Extend
                    </Button>
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Close
                    </Button>
                    <Button variant="outline" size="sm" onClick={onDuplicate}>
                        Duplicate
                    </Button>
                    <Button variant="warning" size="sm" onClick={onCloseAllPastDue}>
                        Close All Past Due
                    </Button>
                    <Button variant="danger" size="sm" onClick={onDelete}>
                        Delete
                    </Button>
                    <Button variant="glass" size="sm" onClick={onDeselectAll}>
                        Deselect All
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default HomeworkBulkActionBar;
