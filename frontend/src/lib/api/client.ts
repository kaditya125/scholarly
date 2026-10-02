import axios from 'axios';
import { auth } from '../firebase';
import { getApiBaseUrl } from './baseUrl';

// Base URL resolution lives in ./baseUrl.ts — the single source of truth for HTTP, SSE and WebSocket.
export { getApiBaseUrl, getWebSocketUrl } from './baseUrl';

const baseURL = getApiBaseUrl();

// For raw fetch() calls and streaming SSE endpoints.
export const API_BASE_URL = baseURL;

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the current user's Firebase ID token to every outgoing request so that
// authenticated backend routes (notebooks, assets, knowledge graph, admin, etc.)
// receive a valid Bearer token. Firebase refreshes the token automatically.
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      // Proceed without a token; the backend will respond 401 if auth is required.
      console.warn('Failed to attach Firebase auth token:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);
