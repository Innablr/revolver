// eslint-disable-next-line import/no-unresolved
import { EventBridgeEvent, SQSEvent, ScheduledEvent, ScheduledHandler, SQSHandler } from 'aws-lambda';
import environ from './lib/environ';
import { AccountRevolver } from './lib/accountRevolver';
import { logger } from './lib/logger';
import { RevolverConfig } from './lib/config';
import dateTime from './lib/dateTime';
import assume from './lib/assume';

const sqsRecordPrefix = process.env['SQS_RECORD_PREFIX'];
export const handlerSQS: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    if (sqsRecordPrefix) {
      const recordId = record.messageAttributes[sqsRecordPrefix]?.stringValue;
      if (recordId) logger.settings.prefix = [recordId];
    }
    logger.info(`Starting revolver for record ${record.messageId}`);
    logger.debug(`Record: ${record}`);
    const configuration = Buffer.from(record.body).toString('utf-8');
    const config = RevolverConfig.validateConfig(configuration);

    dateTime.freezeTimeUnix(record.attributes.SentTimestamp);
    await main(config);
  }
};

export const handler: ScheduledHandler = async (event: EventBridgeEvent<'Scheduled Event', ScheduledEvent>) => {
  logger.info('Starting revolver, got event', event);

  dateTime.freezeTime(event.time);
  logger.info(`Got time ${dateTime.getTime()}`);

  const config = await (
    environ.configPath
      ? RevolverConfig.readConfigFromFile(environ.configPath)
      : RevolverConfig.readConfigFromS3(environ.configBucket!, environ.configKey!)
  ).catch(function (e: Error) {
    throw new Error(`Unable to parse config object: ${e}. Exiting.`);
  });

  await main(config);
};

async function main(config: any) {
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
  const orgsAccountsList = await RevolverConfig.getOrganisationsAccounts(organisationCreds);

  // Filter final accounts list to be processed
  const filteredAccountsList = await RevolverConfig.filterAccountsList(orgsAccountsList, config);

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
    `Revolver will run on ${authenticatedAccounts.length} account(s): ${authenticatedAccounts.map((xa: any) => `${xa.settings.name}(${xa.accountId})`)}`,
  );

  const revolvers = authenticatedAccounts.map((account: any) => new AccountRevolver(account));

  await Promise.all(revolvers.map((revolver) => revolver.initialise()));

  await Promise.all(revolvers.map((revolver) => revolver.revolve()));

  logger.info('One revolution done.');
}
