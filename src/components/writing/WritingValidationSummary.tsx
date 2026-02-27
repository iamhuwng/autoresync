/**
 * WritingValidationSummary — PRD-0030 Task 2.3
 * Shows validation state: blocking errors (❌) + warnings (⚠️) + passing checks (✅).
 * NO MANTINE.
 */

import './WritingTestBuilder.css';

export interface ValidationState {
    errors: string[];
    warnings: string[];
}

interface WritingValidationSummaryProps {
    validationState: ValidationState;
}

export default function WritingValidationSummary({ validationState }: WritingValidationSummaryProps) {
    const { errors, warnings } = validationState;
    const allPassing = errors.length === 0 && warnings.length === 0;

    return (
        <div className="wtb-validation">
            <h4 className="wtb-validation-title">
                {allPassing ? '✅ Ready to Publish' : 'Validation Summary'}
            </h4>

            <ul className="wtb-validation-list">
                {errors.map((msg, i) => (
                    <li key={`err-${i}`} className="wtb-validation-item wtb-validation-item--error">
                        ❌ {msg}
                    </li>
                ))}
                {warnings.map((msg, i) => (
                    <li key={`warn-${i}`} className="wtb-validation-item wtb-validation-item--warning">
                        ⚠️ {msg}
                    </li>
                ))}
                {allPassing && (
                    <li className="wtb-validation-item wtb-validation-item--pass">
                        All checks passed — test is ready to publish.
                    </li>
                )}
            </ul>
        </div>
    );
}

/**
 * Validate a writing test draft.
 * Returns categorized errors (blocking) and warnings (non-blocking).
 */
export function validateWritingTest(
    metadata: { title: string; duration: number; format: string },
    tasks: Array<{ taskNumber: number; promptText: string; promptImageUrl?: string; modelAnswer?: string }>
): ValidationState {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Metadata validation
    if (!metadata.title.trim()) {
        errors.push('Test title is required');
    }
    if (!metadata.duration || metadata.duration <= 0) {
        errors.push('Duration must be greater than 0');
    }

    // Per-task validation
    for (const task of tasks) {
        if (!task.promptText.trim()) {
            errors.push(`Task ${task.taskNumber}: Prompt text is required`);
        }

        if (task.taskNumber === 1 && !task.promptImageUrl) {
            errors.push(`Task 1: Image is required for data description tasks`);
        }

        if (!task.modelAnswer?.trim()) {
            warnings.push(`Task ${task.taskNumber}: Model answer not provided`);
        }
    }

    return { errors, warnings };
}
