// API configuration for KDT Aso
// Production: Render backend, Development: localhost
export const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? 'https://kdt-aso.onrender.com' : 'http://localhost:3001')

// Helper to build full API URLs
export function apiUrl(path: string): string {
  // If path already has the full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_URL}${normalizedPath}`
}

// Fetch wrapper that automatically uses the API URL
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = apiUrl(path)
  return fetch(url, {
    ...options,
    credentials: 'include',
  })
}
