// src/services/ipService.js

/**
 * Fetches the client's public IP address from the ipify API.
 * @returns {Promise<string|null>} The IP address or null if an error occurs.
 */
export const getIpAddress = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) {
      throw new Error('Failed to fetch IP address');
    }
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error("Could not fetch IP address:", error);
    return null;
  }
};
