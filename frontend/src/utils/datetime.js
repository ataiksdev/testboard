const WAT_ZONE = 'Africa/Lagos'; // UTC+1, no DST — West Africa Time

export const formatDateTimeWAT = (value) =>
  new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short', timeZone: WAT_ZONE });

export const formatDateWAT = (value) =>
  new Date(value).toLocaleDateString([], { timeZone: WAT_ZONE });
