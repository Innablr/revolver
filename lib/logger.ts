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

export interface RevolverLogObject {
  accountId?: string;
  accountName?: string;
  pluginName?: string;
  driverName?: string;
}

export const logger = new Logger<RevolverLogObject>({
  name: 'revolver',
  type: environ.logFormat,
  stylePrettyLogs: environ.stylePrettyLogs,
  prettyLogTimeZone: environ.prettyLogTimeZone,
  minLevel: logLevels[environ.logLevel],
  hideLogPositionForProduction: logLevels[environ.logLevel] > 2,
});
