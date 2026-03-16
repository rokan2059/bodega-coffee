/**
 * API utility to handle base URL for different deployment environments.
 * Defaults to current origin if VITE_API_BASE_URL is not set.
 */
const BASE_URL = '';
console.log(`[API] Using relative paths`);

import socket from './socket';

export const apiFetch = async (endpoint: string, options: RequestInit = {}, retries = 2) => {
  const headers = {
    'Accept': 'application/json',
    ...options.headers,
  };
  const url = typeof window !== 'undefined' ? (window.location.origin + endpoint) : endpoint;
  const logMsg = `[API] Fetching: ${url} (${options.method || 'GET'})`;
  console.log(logMsg);
  socket.emit('client_log', { message: logMsg });
  
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, { ...options, headers });
      const statusMsg = `[API] Response: ${response.status} for ${url}`;
      console.log(statusMsg);
      socket.emit('client_log', { message: statusMsg });
      
      if (!response.ok) {
        const text = await response.text();
        console.error(`[API] Request failed: ${response.status}`, text);
        socket.emit('client_log', { message: `[API] Request failed: ${response.status} - ${text}`, error: true });
      }

      return response;
    } catch (error) {
      if (i === retries) {
        const errMsg = `[API] Fetch error for ${url} after ${retries} retries: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errMsg);
        socket.emit('client_log', { message: errMsg, error: true });
        throw error;
      }
      const retryMsg = `[API] Retrying fetch for ${url} (${i + 1}/${retries})...`;
      console.warn(retryMsg);
      socket.emit('client_log', { message: retryMsg });
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('Fetch failed after retries');
};
