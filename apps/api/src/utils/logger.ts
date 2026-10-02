const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'jwt',
  'token',
  'secret',
  'apikey',
  'authorization',
  'accesskey',
  'secretkey',
];

function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk));
    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = meta ? JSON.stringify(sanitize(meta)) : '';
    console.log(`[${timestamp}] [INFO] ${message} ${sanitizedMeta}`.trim());
  },

  warn(message: string, meta?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = meta ? JSON.stringify(sanitize(meta)) : '';
    console.warn(`[${timestamp}] [WARN] ${message} ${sanitizedMeta}`.trim());
  },

  error(message: string, meta?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = meta ? JSON.stringify(sanitize(meta)) : '';
    console.error(`[${timestamp}] [ERROR] ${message} ${sanitizedMeta}`.trim());
  },

  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      const sanitizedMeta = meta ? JSON.stringify(sanitize(meta)) : '';
      console.debug(`[${timestamp}] [DEBUG] ${message} ${sanitizedMeta}`.trim());
    }
  },
};
