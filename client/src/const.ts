export const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
export const LOGIN_PATH = "/login";

export function getLoginUrl(): string {
  return LOGIN_PATH;
}
