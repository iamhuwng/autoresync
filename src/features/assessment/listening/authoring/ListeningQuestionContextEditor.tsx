import React from 'react';
import type { ListeningQuestionContext } from '../../../../skills/listening/utils/listeningQuestionContext';

interface Props {
  context: ListeningQuestionContext;
  onChange: (context: ListeningQuestionContext) => void;
  disabled?: boolean;
}

export function ListeningQuestionContextEditor({ context, onChange, disabled }: Props) {
  const fieldStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
    borderRadius: 4, font: 'inherit', color: '#1e293b', background: '#fff', boxSizing: 'border-box' };
  return (
    <fieldset disabled={disabled} style={{ margin: 0, padding: '12px 24px', border: 0, borderBottom: '1px solid #e2e8f0', maxHeight: 220, overflowY: 'auto', flexShrink: 0 }}>
      <legend style={{ padding: 0, fontWeight: 600, fontSize: 14 }}>Listening form context</legend>
      <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
        <label>Form heading
          <input style={fieldStyle} value={context.sectionHeading ?? ''}
            onChange={event => onChange({ ...context, sectionHeading: event.target.value })} />
        </label>
        <label>Form subheading
          <input style={fieldStyle} value={context.subsectionLabel ?? ''}
            onChange={event => onChange({ ...context, subsectionLabel: event.target.value })} />
        </label>
        <label>Form context
          <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={5} value={context.contextLines?.join('\n') ?? ''}
            onChange={event => onChange({ ...context, contextLines: event.target.value.split('\n') })} />
        </label>
        <span style={{ color: '#64748b' }}>Keep each answer's question number in its blank, for example [1] or ___2___.</span>
      </div>
    </fieldset>
  );
}
