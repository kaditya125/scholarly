import axios, { AxiosError } from 'axios';
import { auth } from '../firebase';

/**
 * Shared Axios instance for all Admin API calls.
 *
 * - Base URL comes from VITE_API_URL (admin routes live under `${VITE_API_URL}/admin`).
 * - Every request is authenticated with the current Firebase user's ID token.
 * - Errors are normalized so React Query surfaces a readable message.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach the Firebase ID token to every request.
apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // If token retrieval fails, the request proceeds unauthenticated and the
      // backend will respond 401 — surfaced to the user by the error state.
    }
  }
  return config;
});

// Normalize errors into a consistent message for the UI.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    const status = error.response?.status;
    const serverMsg = (error.response?.data as any)?.error || (error.response?.data as any)?.message;
    let message = serverMsg || error.message || 'Request failed';
    if (status === 401) message = 'Not authenticated. Please sign in again.';
    if (status === 403) message = 'Access denied. Your account lacks an admin/moderator role.';
    (error as any).uiMessage = message;
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'uiMessage' in error) {
    return String((error as any).uiMessage);
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
