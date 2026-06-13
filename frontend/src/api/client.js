export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function api(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) throw new Error((await response.json()).message || "Request failed");
  return response.status === 204 ? null : response.json();
}
