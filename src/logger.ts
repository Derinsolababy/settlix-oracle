import pino from 'pino';

export function createLogger(level = process.env.LOG_LEVEL ?? 'info') {
  return pino({
    level,
    redact: ['req.headers.authorization', 'secret', '*.secret'],
  });
}

export type Logger = ReturnType<typeof createLogger>;
