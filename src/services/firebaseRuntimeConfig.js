export const QUALIFICATION_HOST_PREFIX = 'qualification-';
export const QUALIFICATION_CHANNEL_MARKER = '--qualification-release-';

export const isQualificationHost = (hostname = '', hostingSite = '') => {
  const normalizedHost = String(hostname).trim().toLowerCase();
  const normalizedSite = String(hostingSite).trim().toLowerCase();
  if (!normalizedHost.endsWith('.web.app')) return false;
  if (normalizedSite && (normalizedHost === `${normalizedSite}.web.app` || normalizedHost.startsWith(`${normalizedSite}--`))) return true;
  return normalizedHost.startsWith(QUALIFICATION_HOST_PREFIX) || normalizedHost.includes(QUALIFICATION_CHANNEL_MARKER);
};

export const selectFirebaseRuntimeConfig = ({ hostname = '', production, qualification } = {}) => {
  if (isQualificationHost(hostname, qualification?.hostingSite)) {
    if (!qualification?.projectId || !qualification?.databaseURL || !qualification?.apiKey || !qualification?.hostingSite) {
      throw new Error('[Firebase] Qualification Hosting requires a complete qualification Firebase configuration.');
    }
    return { environment: 'qualification', config: qualification };
  }
  return { environment: 'production', config: production };
};
