// eslint-disable-next-line import/no-unresolved
import { EventBridgeEvent, ScheduledEvent, ScheduledHandler } from 'aws-lambda';
import environ from './lib/environ';
import { AccountRevolver } from './lib/accountRevolver';
import { logger } from './lib/logger';
import { RevolverConfig } from './lib/config';
import dateTime from './lib/dateTime';
import assume from './lib/assume';

export const handler: ScheduledHandler = async (event: EventBridgeEvent<'Scheduled Event', ScheduledEvent>) => {
  const configMethods = new RevolverConfig();
  logger.info('Starting revolver, got event', event);

  dateTime.freezeTime(event.time);
  logger.info(`Got time ${dateTime.getTime()}`);

  const config = await (
    environ.configPath
      ? configMethods.readConfigFromFile(environ.configPath)
      : configMethods.readConfigFromS3(environ.configBucket!, environ.configKey!)
  ).catch(function (e: Error) {
    throw new Error(`Unable to parse config object: ${e}. Exiting.`);
  });

  // Assume-role on each org (if any listed) and get the list of accounts from it
  const organisationCreds = await Promise.all(
    config.organizations.flatMap((xa: any) => {
      logger.info(`Getting list of accounts from ${xa.settings.name} organization..`);
      return assume
        .connectTo(`arn:aws:iam::${xa.accountId}:role/${xa.settings.organizationRoleName}`)
        .then((cred: any) => {
          cred.settings = xa.settings;
          return cred;
        });
    }),
  );
  const orgsAccountsList = await configMethods.getOrganisationsAccounts(organisationCreds);

  // Filter final accounts list to be processed
  const filteredAccountsList = await configMethods.filterAccountsList(orgsAccountsList, config);

  // Try to assume role on the listed accounts and remove from the list if fails
  logger.info('Caching STS credentials...');
  const authenticatedAccounts = await Promise.all(
    filteredAccountsList.flatMap((account: any) =>
      assume
        .connectTo(account.settings.assumeRoleArn)
        .then((auth: any) => (auth ? account : undefined))
        .catch((err) => {
          logger.error(`Unable to assume role ${account.settings.assumeRoleArn} on ${account.accountId}: ${err}`);
          logger.error(`Account ${account.accountId} will be skipped`);
          return undefined;
        }),
    ),
  ).then((xaccts) => xaccts.filter((x: any) => x));

  if (authenticatedAccounts.length < 1) {
    throw new Error('No accounts selected to run Revolver');
  }

  logger.info(
    `Revolver will run on ${authenticatedAccounts.length} account(s): ${authenticatedAccounts.map((xa: any) => `${xa.settings.name}(${xa.account_id})`)}`,
  );

  const revolvers = authenticatedAccounts.map((account: any) => new AccountRevolver(account));

  await Promise.all(revolvers.map((revolver) => revolver.initialise()));

  await Promise.all(revolvers.map((revolver) => revolver.revolve()));

  logger.info('One revolution done.');
};
