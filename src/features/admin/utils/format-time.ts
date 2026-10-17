const stamp = new Intl.DateTimeFormat('en-PK', {
  timeZone: 'Asia/Karachi',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** "17 Oct 2026, 9:30 pm" in Karachi time, whatever timezone the server runs in. */
export function formatKarachi(iso: string): string {
  return stamp.format(new Date(iso));
}
