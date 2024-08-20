import { Logger, ISettingsParam } from 'tslog';
import environ from './environ.js';

const logLevels: { [key: string]: number } = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
};

const logLevelsToConsole: { [key: number]: (...args: any) => any } = {
  0: console.trace,
  1: console.trace,
  2: console.debug,
  3: console.info,
  4: console.warn,
  5: console.error,
  6: console.error,
};

export interface RevolverLogObject {
  accountId?: string;
  accountName?: string;
  pluginName?: string;
  driverName?: string;
}

/**
 * Restructure JSON logs to behave better in JSON ingestors like cloudwatch.
 *
 * Writes JSON logs to the appropriate console.\{level\} function and converts any configured log prefixes
 * to object keys if they have a ':' separator. Splits out string messages and object messages to message and data.
 */
export function restructureJsonLog(log: any) {
  if (log === undefined) return;
  // biome-ignore lint/suspicious/noGlobalIsNan: we are relying on string-numbers being coerced to numbers
  const positionalEntries: string[] = Object.keys(log).filter((k: any) => !isNaN(k));

  const prefixEntries: string[] = positionalEntries.slice(0, logger.settings.prefix.length);
  const processedPrefix: { [key: string]: boolean } = {};
  const prefixes: { [key: string]: string } = {};

  // Move prefixed entries to true keys if they have a name
  prefixEntries.forEach((k) => {
    const segments = log[k].split(':');
    if (segments.length > 1) {
      prefixes[segments[0]] = segments.slice(1).join(':');
      processedPrefix[k] = true;
    }
  });

  const data: any[] = [];

  // create unified message
  const message: string = positionalEntries
    .filter((k) => !processedPrefix[k])
    .filter((k) => {
      // arrays can be string printed
      // move objects to data array
      if (typeof log[k] === 'object' && !Array.isArray(log[k])) {
        data.push(log[k]);
        return false;
      }
      return true;
    })
    .map((k) => log[k])
    .join(' ');

  positionalEntries.forEach((k: string) => delete log[k]);

  // assemble new object
  const messageObj: { [key: string]: any } = {
    message: message,
  };
  if (data.length > 0) {
    messageObj.data = data;
  }

  // write to log level specific console.log
  const outputLog = logLevelsToConsole[log[logger.settings.metaProperty].logLevelId] || console.log;

  outputLog(
    JSON.stringify({
      ...messageObj,
      ...prefixes,
      ...log,
    }),
  );
}

/**
 * Return a sub-logger with the given accountName and accountId, and any other attributes.
 * @param accountName - an accountConfig.name
 * @param accountId - an AWS account ID
 * @param extra - a object contain other properties to add to the context, eg pluginName, driverName
 * @returns a child logger based on the settings above
 */
export function getSubLogger(accountName: string, accountId: string, extra?: object) {
  return logger.getSubLogger(
    { name: `${accountName}(${accountId})` },
    { accountId: accountId, accountName: accountName, ...extra },
  );
}
/**
 * A Logger that keeps track of whether a log of level 'error' or greater has been emitted.
 */
export class ErrorTrackingLogger<LogObj> extends Logger<LogObj> {
  public hasError = false;
  constructor(settings?: ISettingsParam<LogObj>, logObj?: LogObj) {
    super(settings, logObj);
    this.attachTransport((logObj) => {
      this.hasError ||= logObj._meta.logLevelId >= logLevels.error;
    });
  }
}

export const logger = new ErrorTrackingLogger<RevolverLogObject>({
  name: 'revolver',
  type: environ.logFormat,
  stylePrettyLogs: environ.stylePrettyLogs,
  prettyLogTimeZone: environ.prettyLogTimeZone,
  minLevel: logLevels[environ.logLevel],
  hideLogPositionForProduction: logLevels[environ.logLevel] > 2,
  overwrite: {
    transportJSON: (logObjWithMeta: any) => {
      restructureJsonLog(logObjWithMeta);
    },
  },
});
