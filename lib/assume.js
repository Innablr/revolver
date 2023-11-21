const AWS = require('aws-sdk');
const dateTime = require('./dateTime');
const winston = require('winston');
const moment = require('moment-timezone');

class RemoteCredentials {
    constructor() {
        this.creds = {};
    }

    accountId(remoteRole) {
        const [, accountId] = remoteRole.match(/arn:aws:iam:.*:([0-9]{12}):role\/(.+)/);
        return accountId;
    }

    connectTo(remoteRole) {
        const logger = winston.loggers.get('global');
        const that = this;
        const sts = new AWS.STS();

        logger.debug('Requested connection via [%s]', remoteRole);

        if (remoteRole in that.creds) {
            if (that.creds[remoteRole].expiration > moment.utc()) {
                logger.debug('Role [%s] is cached, returning access key [%s], expire at [%s]',
                    remoteRole, that.creds[remoteRole].creds.accessKeyId, that.creds[remoteRole].expiration);
                return Promise.resolve(that.creds[remoteRole].creds);
            }
            logger.debug('Cached role [%s] expired at [%s], requesting new creds...',
                remoteRole, that.creds[remoteRole].expiration);
        }

        logger.debug('Assuming role [%s]...', remoteRole);
        return sts.assumeRole({
            RoleArn: remoteRole,
            RoleSessionName: `Revolver_${dateTime.getTime().format('YYYYMMDDHHmmss')}`
        }).promise()
            .then(function (r) {
                const expireAt = moment.utc(r.Credentials.Expiration).subtract(5, 'seconds');
                const tokenCreds = new AWS.Credentials({
                    accessKeyId: r.Credentials.AccessKeyId,
                    secretAccessKey: r.Credentials.SecretAccessKey,
                    sessionToken: r.Credentials.SessionToken
                });
                logger.debug('Assumed role [%s] will expire at [%s] plus 5 seconds.', remoteRole, expireAt);
                that.creds[remoteRole] = {
                    expiration: expireAt,
                    creds: tokenCreds
                };
            })
            .then(function () {
                logger.debug('Caching role [%s] with access key [%s]', remoteRole, that.creds[remoteRole].creds.accessKeyId);
                return that.creds[remoteRole].creds;
            })
            .catch(() => {
                logger.info('Failed assuming role %s on Account %s. Revolver will not run in this account.', remoteRole, remoteRole.split(':')[4]);
                return false;
            });
    }
}

module.exports = new RemoteCredentials();