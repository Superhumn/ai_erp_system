/**
 * Google Calendar Integration Service
 * Handles fetching, creating, and deleting calendar events via the Google Calendar API.
 *
 * NOTE: You must enable the Google Calendar API in your Google Cloud Console:
 * https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export async function getCalendarEvents(
  accessToken: string,
  timeMin?: string,
  timeMax?: string,
  maxResults = 50
) {
  const now = new Date();
  const min = timeMin || now.toISOString();
  const max =
    timeMax ||
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Next 30 days

  const url = `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  return res.json();
}

export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
    location?: string;
  }
) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  return res.json();
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
) {
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 204)
    throw new Error(`Calendar API error: ${res.status}`);
  return { success: true };
}
