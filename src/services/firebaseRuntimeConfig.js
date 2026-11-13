export const QUALIFICATION_HOST_PREFIX = 'qualification-';

export const isQualificationHost = (hostname = '') => hostname.startsWith(QUALIFICATION_HOST_PREFIX) && hostname.endsWith('.web.app');

export const selectFirebaseRuntimeConfig = ({ hostname = '', production, qualification } = {}) => {
  if (isQualificationHost(hostname)) {
    if (!qualification?.projectId || !qualification?.databaseURL || !qualification?.apiKey) {
      throw new Error('[Firebase] Qualification Hosting requires a complete qualification Firebase configuration.');
    }
    return { environment: 'qualification', config: qualification };
  }
  return { environment: 'production', config: production };
};
