import { expect } from 'chai';
import { ErrorTrackingLogger, logger, restructureJsonLog, RevolverLogObject } from '../../lib/logger.js';

// TODO: validate JSON format, including restructure
// TODO: validate metadata
// TODO: validate minLevel

describe('Validate ErrorTrackingLogger behaviour', function () {
  // hasError should start out false, and once error/fatal message has been
  // emitted, should be set to true, and stay that way.
  logger.hasError = false; // reset

  expect(logger.hasError).to.be.false;
  logger.trace('sample message');
  expect(logger.hasError).to.be.false;
  logger.debug('sample message');
  expect(logger.hasError).to.be.false;
  logger.info('sample message');
  expect(logger.hasError).to.be.false;
  logger.warn('sample message');
  expect(logger.hasError).to.be.false;
  logger.error('sample message');
  expect(logger.hasError).to.be.true;
  logger.fatal('sample message');
  expect(logger.hasError).to.be.true;
  logger.info('sample message');
  expect(logger.hasError).to.be.true;

  logger.hasError = false; // reset
});

describe('Validate JSON logging', function () {
  const jsonLogger = new ErrorTrackingLogger<RevolverLogObject>({
    name: 'revolver',
    type: 'json',
    // stylePrettyLogs: environ.stylePrettyLogs,
    // prettyLogTimeZone: environ.prettyLogTimeZone,
    minLevel: 2, // logLevels['debug'],
    hideLogPositionForProduction: false, // logLevels[environ.logLevel] > 2,
    overwrite: {
      transportJSON: (logObjWithMeta: any) => {
        restructureJsonLog(logObjWithMeta);
      },
    },
  });

  // Validate that this works
  jsonLogger.debug('sample message 1');
  jsonLogger.info('sample message 2');
});
