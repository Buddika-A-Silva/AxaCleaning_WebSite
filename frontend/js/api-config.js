const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE = isLocal
  ? '/api'
  : 'https://wuhfojchbveaeozyztxs.supabase.co/functions/v1/axa-api';
