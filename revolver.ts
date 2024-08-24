import zlib from 'node:zlib';
import { PromisePool } from '@supercharge/promise-pool';
import { EventBridgeEvent, SQSEvent, SQSHandler, ScheduledEvent, ScheduledHandler } from 'aws-lambda';
import { AccountRevolver } from './lib/accountRevolver.js';
import assume from './lib/assume.js';
import { RevolverConfig } from './lib/config.js';
import dateTime from './lib/dateTime.js';
import environ from './lib/environ.js';
import { logger } from './lib/logger.js';

// Specify a SQS message attribute to log out to the console
const sqsLogAttribute = process.env.SQS_LOG_ATTRIBUTE;

export const handlerSQS: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    if (sqsLogAttribute) {
      const recordId = record.messageAttributes[sqsLogAttribute]?.stringValue;
      if (recordId) logger.settings.prefix = [`${sqsLogAttribute}:${recordId}`];
    }
    logger.info(`Starting revolver for record ${record.messageId}`);
    logger.trace('Record', record);

    let body = record.body;

    // assumed base64 encoding since this is a text field
    if (record.messageAttributes.compression?.stringValue === 'zlib') {
      body = zlib.inflateSync(Buffer.from(record.body, 'base64')).toString('utf-8');
    }

    const config = RevolverConfig.validateYamlConfig(body);

    dateTime.freezeTimeUnix(record.attributes.SentTimestamp);
    await main(config);
  }
};

export const handler: ScheduledHandler = async (event: EventBridgeEvent<'Scheduled Event', ScheduledEvent>) => {
  logger.info('Starting revolver, got event', event);

  dateTime.freezeTime(event.time);
  logger.info(`Got time ${dateTime.getTime()}`);

  const config = await (environ.configPath
    ? RevolverConfig.readConfigFromFile(environ.configPath)
    : RevolverConfig.readConfigFromS3(environ.configBucket!, environ.configKey!)
  ).catch(function (e: Error) {
    throw new Error(`Unable to parse config object: ${e}. Exiting.`);
  });

  await main(config);
};

async function main(config: any) {
  const local = config.defaults.settings.localOrgAccountsFile;
  let orgsAccountsList: any[];
  if (local !== undefined) {
    orgsAccountsList = await RevolverConfig.getLocalOrganisationsAccounts(local);
  } else {
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
    orgsAccountsList = await RevolverConfig.getOrganisationsAccounts(organisationCreds);

    const localWrite = config.defaults.settings.localOrgAccountsWriteFile;
    if (localWrite !== undefined) {
      await RevolverConfig.writeLocalOrganisationsAccounts(localWrite, orgsAccountsList);
    }
  }

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

  const concurrency = config.defaults.settings.concurrency;
  if (concurrency > 0) {
    logger.info('Limiting revolver concurrency to %d', concurrency);
    await PromisePool.for(revolvers)
      .withConcurrency(concurrency)
      .process((revolver) => revolver.revolve());
  } else {
    await Promise.all(revolvers.map((revolver) => revolver.revolve()));
  }

  logger.info('One revolution done.');
  if (logger.hasError) {
    throw new Error('Errors were emitted during execution');
  }
}
