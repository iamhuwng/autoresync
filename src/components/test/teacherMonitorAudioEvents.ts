export const TEACHER_MONITOR_AUDIO_RESUME_EVENT = 'teacher-monitor-audio-resume-request';

export type TeacherMonitorAudioResumeDetail = {
  source: 'control-bar';
};

export function dispatchTeacherMonitorAudioResumeRequest(
  detail: TeacherMonitorAudioResumeDetail = { source: 'control-bar' },
): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  window.dispatchEvent(new CustomEvent<TeacherMonitorAudioResumeDetail>(
    TEACHER_MONITOR_AUDIO_RESUME_EVENT,
    { detail },
  ));
}
