const fs = require('node:fs/promises');
const path = require('node:path');
const yaml = require('js-yaml');
const AWS = require('aws-sdk');
const winston = require('winston');
const common = require('./common');
const _ = require('lodash');

class Settings {
    constructor() {
        this.settings = {};
    }

    store(settings) {
        this.settings = settings;
    }

    get(key) {
        return this.settings[key];
    }
}

const settings = new Settings();

class RevolverConfig {
    constructor() {
        this.logger = winston.loggers.get('global');
    }

    addAccountLogger(accountName, level) {
        winston.loggers.add(accountName, {
            transports: [this.configureLogTransport(accountName, level)]
        });
    }

    configureLogTransport(label, level) {
        return new winston.transports.Console({
            timestamp: true,
            showLevel: true,
            debugStdout: true,
            label,
            level
        });
    }

    validateConfig(data) {
        const config = yaml.load(data);
        this.logger.debug('Revolver config is: %j', config);
        if (!Array.isArray(config.accounts.include_list)) {
            throw new Error('Invalid configuration. \'include_list\' key is either missing or not an array');
        }
        if (!Array.isArray(config.accounts.exclude_list)) {
            throw new Error('Invalid configuration. \'exclude_list\' key is either missing or not an array');
        }
        settings.store(config.settings);
        // merge default settings and extract some info
        config.organizations = config.organizations.map(r => _.merge({}, config.defaults, r));
        config.accounts.include_list = config.accounts.include_list.map(r => _.merge({}, config.defaults, r));
        config.accounts.exclude_list = config.accounts.exclude_list.map(r => _.merge({}, config.defaults, r));

        config.defaults.settings.organizationRoleName = config.defaults.settings.organization_role_name;
        config.defaults.settings.revolverRoleName = config.defaults.settings.revolver_role_name;

        const ec2DriverDefaultConfig = config.defaults.drivers.find(d => d.name === 'ec2');

        if (ec2DriverDefaultConfig !== undefined) {
            ec2DriverDefaultConfig.inspectorAssessmentTarget =
                ec2DriverDefaultConfig.inspector_assessment_target
                    ? ec2DriverDefaultConfig.inspector_assessment_target
                    : '';
        }

        config.organizations.map(org => {
            org.Id = org.account_id;
            org.settings.organizationRoleName = org.settings.organization_role_name;
            org.settings.revolverRoleName = org.settings.revolver_role_name;
        });
        config.accounts.include_list.map(acc => {
            acc.Id = acc.account_id;
            acc.settings.revolverRoleName = acc.settings.revolver_role_name;
        });
        config.accounts.exclude_list.map(acc => {
            acc.Id = acc.account_id;
            acc.settings.revolverRoleName = acc.settings.revolver_role_name;
        });

        return config;
    }

    async readConfigFromFile(configFile) {
        const fullPath = path.resolve(configFile);
        this.logger.debug(`Fetching config from file ${fullPath}`);
        return this.validateConfig(
            await fs.readFile(fullPath, { encoding: 'utf8' })
        )
    }

    async readConfigFromS3(configBucket, configKey) {
        const logger = this.logger;
        const s3 = new AWS.S3();
        logger.debug(`Fetching config from bucket [${configBucket}] key [${configKey}]`);
        logger.debug(`configBucket: ${configBucket}`);
        logger.debug(`configKey: ${configKey}`);
        return this.validateConfig(
            await s3.getObject({ Bucket: configBucket, Key: configKey })
                .promise()
                .then(function (data) {
                    logger.debug(`Found S3 object MIME ${data.ContentType}`);
                    return data.Body.toString('utf8');
                })
        )
    }

    getOrganisationsAccounts(creds) {
        const defaultRegion = 'us-east-1';
        return Promise.all(
            creds.map(cr => {
                const client = new AWS.Organizations({credentials: cr, region: defaultRegion});
                return common.paginateAwsCall(client.listAccounts.bind(client), 'Accounts')
                    .then(accounts =>
                        Promise.all(
                            accounts.map(account => {
                                account.settings = {
                                    'name': account.Name,
                                    'region': cr.settings.region,
                                    'timezone': cr.settings.timezone,
                                    'revolverRoleName': cr.settings.revolver_role_name,
                                    'inspectorName': cr.settings.inspectorName
                                };
                                return account;
                            })
                        )
                    );
            })
        );
    }

    filterAccountsList(orgsAccountsList, config, debugLevel) {
        const logger = this.logger;
        logger.info('%d Accounts found on the Organizations listed', orgsAccountsList.length)
        logger.info('Getting accounts from include/exclude lists..');
        logger.info('%d accounts found on include_list', config.accounts.include_list.length);
        logger.info('%d accounts found on exclude_list', config.accounts.exclude_list.length);
        const filteredAccountsList = config.accounts.include_list
            // concat include_list
            .concat(orgsAccountsList)
            // delete exclude_list
            .filter(xa => !config.accounts.exclude_list.find(xi => xi.Id === xa.Id))
            // add logger
            .map(account => {
                this.addAccountLogger(account.settings.name, debugLevel);
                return account;
            })
            // merge with default settings
            .map(account => _.merge({}, config.defaults, account))
            // build assumeRoleArn string, extract account_id and revolver_role_name
            .map(account => {
                account.settings.assumeRoleArn = `arn:aws:iam::${account.Id}:role/${account.settings.revolverRoleName}`;
                return account;
            });

        // remove duplicated accounts
        return _.uniqBy(filteredAccountsList, account => JSON.stringify([account.Id, account.settings.region]));
    }
}

module.exports = RevolverConfig;
module.exports.settings = settings;