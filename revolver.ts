// eslint-disable-next-line import/no-unresolved
import { EventBridgeEvent, ScheduledEvent, ScheduledHandler } from 'aws-lambda';
import environ from './lib/environ';
const RevolverConfig = require('./lib/config');
const accountRevolver = require('./lib/accountRevolver');
const dateTime = require('./lib/dateTime');
const assume = require('./lib/assume');
const winston = require('winston');
const AWS = require('aws-sdk');
const _ = require('lodash');

function configureLogTransport(label: string, level: string) {
    return new winston.transports.Console({
        timestamp: true,
        showLevel: true,
        debugStdout: true,
        label,
        level
    });
}

function addAccountLogger(accountName: string, level: string) {
    winston.loggers.add(accountName, {
        transports: [configureLogTransport(accountName, level)]
    });
}

function configureAWS(maxRetries: number, baseBackoff: number) {
    const logger = winston.loggers.get('global');
    AWS.config.update({
        retryDelayOptions: {
            base: baseBackoff
        },
        maxRetries
    });
    logger.info(`Set AWS SDK retry options to ${baseBackoff}ms base backoff, max retries ${maxRetries}`);
}

export const handler: ScheduledHandler = async (event: EventBridgeEvent<'Scheduled Event', ScheduledEvent>) => {
    addAccountLogger('global', environ.debugLevel);
    const logger = winston.loggers.get('global');
    const configMethods = new RevolverConfig();
    dateTime.freezeTime(event.time);
    logger.info(`Got time ${dateTime.getTime()}`);

    // Set retry parameters
    configureAWS(environ.maxRetries, environ.baseBackoff);

    const config = await (environ.configPath
        ? configMethods.readConfigFromFile(environ.configPath)
        : configMethods.readConfigFromS3(environ.configBucket, environ.configKey))
        .catch(function(e: Error) {
            throw new Error(`Unable to parse config object: ${e}. Exiting.`);
        });

    // Assume-role on each org (if any listed) and get the list of accounts from it
    const orgsAccountsList = await Promise.all(
        config.organizations.map((xa: any) => {
            logger.info('Getting list of accounts from %s organization..', xa.settings.name);
            return assume.connectTo(`arn:aws:iam::${xa.Id}:role/${xa.settings.organizationRoleName}`)
                .then((cred: any) => {
                    cred.settings = xa.settings;
                    return cred;
                });
        }))
        .then(r => _.flatMap(r))
        .then(creds => configMethods.getOrganisationsAccounts(creds))
        .then(r => _.flatMap(r));

    // Filter final accounts list to be processed
    const filteredAccountsList = await configMethods.filterAccountsList(orgsAccountsList, config, environ.debugLevel);

    // Try to assume role on the listed accounts and remove from the list if fails
    logger.info('Caching STS credentials...');
    const authenticatedAccounts = await Promise.all(
        filteredAccountsList.map((account: any) =>
            assume.connectTo(account.settings.assumeRoleArn)
            .then((auth: any) => auth ? account : undefined)
        )
    )
    .then(r => _.flatMap(r.filter(xa => xa)));

    if (authenticatedAccounts.length < 1) {
        throw new Error('No accounts selected to run Revolver');
    }

    logger.info('Revolver will run on %d account(s): %j', authenticatedAccounts.length,
        authenticatedAccounts.map((xa: any) => `${xa.settings.name}(${xa.account_id})`));

    // Run Revolver on selected accounts
    const revolvers = await Promise.all(
        authenticatedAccounts
        .map((account: any) => accountRevolver(account))
    );

    await Promise.all(
        revolvers.map(revolver => revolver.initialise())
    );

    const results = await Promise.all(
        revolvers.map(revolver => revolver.revolve())
    );

    results.forEach(xr => {
        logger.info(xr);
    });
};
