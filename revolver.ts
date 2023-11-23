// eslint-disable-next-line import/no-unresolved
import { EventBridgeEvent, ScheduledEvent, ScheduledHandler } from 'aws-lambda';
import environ from './lib/environ';
import { AccountRevolver } from './lib/accountRevolver';
const RevolverConfig = require('./lib/config');
const dateTime = require('./lib/dateTime');
const assume = require('./lib/assume');
const winston = require('winston');
const AWS = require('aws-sdk');

function configureLogTransport(label: string, level: string) {
  return new winston.transports.Console({
    timestamp: true,
    showLevel: true,
    debugStdout: true,
    label,
    level,
  });
}

function addAccountLogger(accountName: string, level: string) {
  winston.loggers.add(accountName, {
    transports: [configureLogTransport(accountName, level)],
  });
}

function configureAWS(maxRetries: number, baseBackoff: number) {
  const logger = winston.loggers.get('global');
  AWS.config.update({
    retryDelayOptions: {
      base: baseBackoff,
    },
    maxRetries,
  });
  logger.info(`Set AWS SDK retry options to ${baseBackoff}ms base backoff, max retries ${maxRetries}`);
}

export const handler: ScheduledHandler = async (event: EventBridgeEvent<'Scheduled Event', ScheduledEvent>) => {
  addAccountLogger('global', environ.debugLevel);
  const logger = winston.loggers.get('global');
  const configMethods = new RevolverConfig();
  logger.info('Starting revolver, got event %j', event);

  dateTime.freezeTime(event.time);
  logger.info(`Got time ${dateTime.getTime()}`);

  // Set retry parameters
  configureAWS(environ.maxRetries, environ.baseBackoff);

  const config = await (environ.configPath
    ? configMethods.readConfigFromFile(environ.configPath)
    : configMethods.readConfigFromS3(environ.configBucket, environ.configKey)
  ).catch(function (e: Error) {
    throw new Error(`Unable to parse config object: ${e}. Exiting.`);
  });

  // Assume-role on each org (if any listed) and get the list of accounts from it
  const organisationCreds = await Promise.all(
    config.organizations.flatMap((xa: any) => {
      logger.info('Getting list of accounts from %s organization..', xa.settings.name);
      return assume.connectTo(`arn:aws:iam::${xa.Id}:role/${xa.settings.organizationRoleName}`).then((cred: any) => {
        cred.settings = xa.settings;
        return cred;
      });
    }),
  );
  const orgsAccountsList = await configMethods.getOrganisationsAccounts(organisationCreds);

  // Filter final accounts list to be processed
  const filteredAccountsList = await configMethods.filterAccountsList(orgsAccountsList, config, environ.debugLevel);

  // Try to assume role on the listed accounts and remove from the list if fails
  logger.info('Caching STS credentials...');
  const authenticatedAccounts = await Promise.all(
    filteredAccountsList.flatMap((account: any) =>
      assume.connectTo(account.settings.assumeRoleArn).then((auth: any) => (auth ? account : undefined)),
    ),
  ).then((xaccts) => xaccts.filter((x: any) => x));

  if (authenticatedAccounts.length < 1) {
    throw new Error('No accounts selected to run Revolver');
  }

  logger.info(
    'Revolver will run on %d account(s): %j',
    authenticatedAccounts.length,
    authenticatedAccounts.map((xa: any) => `${xa.settings.name}(${xa.account_id})`),
  );

  const revolvers = authenticatedAccounts.map((account: any) => new AccountRevolver(account));

  await Promise.all(revolvers.map((revolver) => revolver.initialise()));

  await Promise.all(revolvers.map((revolver) => revolver.revolve()));

  logger.info('One revolution done.');
};
