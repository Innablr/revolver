import { Logger } from 'tslog';
import environ from './environ';

const logLevels: { [key: string]: number } = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
};

const logger = new Logger({
  name: 'revolver',
  minLevel: logLevels[environ.logLevel],
});

export default logger;
