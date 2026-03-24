export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-ZM', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatShortDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-ZM', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
