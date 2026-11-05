import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { THCSHomeworkAssignDialog } from './THCSHomeworkAssignDialog';
const f = vi.hoisted(() => ({ create: vi.fn(), notice: vi.fn(), success: vi.fn(), track: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher' } }) }));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: f.track }) }));
vi.mock('../../services/homeworkManager', () => ({ createHomework: f.create }));
vi.mock('../../services/notificationProducerClient', () => ({ notifyCommittedEvent: f.notice }));
vi.mock('../../services/classManager', () => ({ getClasses: async () => [{ id: 'class', name: 'Class', studentCount: 1 }], getClass: async () => ({ students: {} }) }));
vi.mock('../modern/ToastNotification', () => ({ toast: { success: f.success, error: vi.fn() } }));
vi.mock('../common/DateTimeCalendar', () => ({ DateTimeCalendar: ({ label, onChange }: any) => <button onClick={() => onChange(new Date(Date.now() + 86400000))}>{label}</button> }));

it('closes after the committed assignment even when its notice never resolves', async () => {
  f.create.mockResolvedValue('homework');
  f.notice.mockImplementation(() => new Promise(() => {}));
  const close = vi.fn();
  render(<THCSHomeworkAssignDialog isOpen onClose={close} testId="test" testTitle="THCS Test" />);
  await screen.findByRole('option', { name: 'Class (1 students)' });
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'class' } });
  fireEvent.click(screen.getByRole('button', { name: /Due Date/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Assign Homework', exact: true }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(f.notice).toHaveBeenCalledWith({ eventKind: 'thcs-homework-assigned', homeworkId: 'homework' });
  expect(f.success).toHaveBeenCalledWith('Homework assigned.');
  expect(f.track).toHaveBeenCalledWith('assignHomework', { homeworkId: 'homework', materialType: 'thcs-test' });
});

it('collects THCS settings for the next material without creating homework', async () => {
  const configureNext = vi.fn(async () => true);
  const submitHomework = vi.fn(async () => undefined);
  const close = vi.fn();

  render(
    <THCSHomeworkAssignDialog
      isOpen
      onClose={close}
      testId="thcs-batch"
      testTitle="THCS Batch"
      contentRef={{ contentKind: 'thcs_test', contentId: 'thcs-batch', source: 'thcs' }}
      preselectedTarget={{ type: 'class', classId: 'class', className: 'Class' }}
      skipTargetSelection
      nextButtonLabel="Next material →"
      onConfigureNext={configureNext}
      onSubmitHomework={submitHomework}
    />,
  );

  expect(screen.getByText('Target Students (shared)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Due Date' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next material →' }));

  await waitFor(() => expect(configureNext).toHaveBeenCalledWith(expect.objectContaining({
    materialId: 'thcs-batch',
    target: { type: 'class', classId: 'class', className: 'Class' },
    contentRef: { contentKind: 'thcs_test', contentId: 'thcs-batch', source: 'thcs' },
  })));
  expect(submitHomework).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalledWith(expect.objectContaining({ materialId: 'thcs-batch' }));
  expect(close).not.toHaveBeenCalled();
});
