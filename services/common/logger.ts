import pino from 'pino';

const service = process.env.DD_SERVICE ?? 'bitsburg-unknown';

// dd-trace (DD_LOGS_INJECTION=true) adds dd.trace_id / dd.span_id to every record.
export const logger = pino({
  base: { service },
  messageKey: 'msg',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});
