export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function formatMiles(miles: number) {
  return `${Number.isInteger(miles) ? miles : miles.toFixed(1)} mi`;
}
