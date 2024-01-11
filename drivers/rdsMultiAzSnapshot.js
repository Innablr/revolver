const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const assume = require('../lib/assume').default;
const { ToolingInterface } = require('./instrumentedResource');
const { DriverInterface, RDSTagger } = require('./driverInterface');
const dateTime = require('../lib/dateTime');

class InstrumentedRdsSnapshot extends ToolingInterface {
    constructor(...args) {
        super(...args);
        this.tags = [];
    }

    get resourceId() {
        return this.resource.DBSnapshotIdentifier;
    }

    get resourceArn() {
        return this.resource.DBSnapshotArn;
    }

    get resourceType() {
        return 'rdsMultiAzSnapshot';
    }

    get launchTimeUtc() {
        return moment(this.resource.SnapshotCreateTime).tz('UTC');
    }

    get resourceState() {
        return 'stopped';
    }

    tag(key) {
        const tag = this.tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }
}


class RdsSnapshotDriver extends DriverInterface {
    restoreRdsSg(resources) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(function(rds) {
                return Promise.all(resources.map(function(xs) {
                    const sg = xs.tag('revolver/db_security_groups');
                    if (sg === undefined) {
                        return Promise.resolve();
                    }
                    logger.info('Restoring security groups %s on instance %s', sg, xs.resource.DBInstanceIdentifier);
                    return rds.modifyDBInstance({
                        DBInstanceIdentifier: xs.resource.DBInstanceIdentifier,
                        VpcSecurityGroupIds: sg.split('/')
                    }).promise()
                    .then(function() {
                        logger.info('Deleting snapshot %s', xs.resource.DBSnapshotIdentifier);
                        return rds.deleteDBSnapshot({DBSnapshotIdentifier: xs.resource.DBSnapshotIdentifier}).promise();
                    })
                    .catch(function(err) {
                        logger.error('Error restoring security groups on instance %s, stack trace will follow:', xs.resource.DBInstanceIdentifier);
                        logger.error(err);
                    });
                }));
            });
    }

    startOneSnapshot(snapshot) {
        let rds = null;
        const logger = this.logger;
        const tzTagName = this.accountConfig.timezone_tag || 'Timezone';
        const tz = snapshot.tag(tzTagName) || this.accountConfig.timezone || 'utc';
        const locaTimeNow = dateTime.getTime(tz);

        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(r => {rds = r;})
            .then(function() {
                logger.info('RDS instance %s will now be restored from snapshot %s',
                    snapshot.resource.DBInstanceIdentifier, snapshot.resourceId);
                return rds.restoreDBInstanceFromDBSnapshot({
                    DBInstanceIdentifier: snapshot.resource.DBInstanceIdentifier,
                    DBSnapshotIdentifier: snapshot.resourceId,
                    DBSubnetGroupName: snapshot.tag('revolver/db_subnet_group_name'),
                    MultiAZ: true,
                    Tags: snapshot.tags.filter(xt => !xt.Key.startsWith('revolver/'))
                }).promise();
            })
            .then(function() {
                logger.info('Marking restoration start on snapshot %s', snapshot.resourceId);
                return rds.addTagsToResource({
                    ResourceName: snapshot.resourceArn,
                    Tags: [{Key: 'revolver/restore_commenced', Value: locaTimeNow.format('YYYYMMDDhhmmss')}]
                }).promise();
            })
            .catch(function(err) {
                logger.error('Error restoring RDS snapshot %s, stack trace will follow:', snapshot.resourceId);
                logger.error(err);
            });
    }

    start(resources) {
        const that = this;
        return Promise.all(resources.map(function(xs) {
            if (xs.tag('revolver/restore_commenced') !== undefined) {
                that.logger.info('RDS snapshot %s already started restoring at %s', xs.resourceId, xs.tag('revolver/restore_commenced'));
                return Promise.resolve();
            }
            return that.startOneSnapshot(xs);
        }));
    }

    stop() {
        this.logger.debug('An RDS snapshot can\'t be stopped directly, ignoring action');
        return Promise.resolve();
    }

    maskstop(resource) {
        return `RDS snapshot ${resource.resourceId} can't be stopped`;
    }

    noop(resources, action) {
        this.logger.info('RDS snapshots %j will noop because: %s', resources.map(xs => xs.resourceId), action.reason);
        return Promise.resolve();
    }

    async setTag(resources, action) {
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const rds = new AWS.RDS({credentials: creds, region: this.accountConfig.region});

        return RDSTagger.setTag(rds, this.logger, resources, action);
    }

    masksetTag(resource, action) {
        return RDSTagger.masksetTag(resource, action);
    }

    async unsetTag(resources, action) {
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const rds = new AWS.RDS({credentials: creds, region: this.accountConfig.region});

        return RDSTagger.unsetTag(rds, this.logger, resources, action);
    }

    maskunsetTag(resource, action) {
        return RDSTagger.maskunsetTag(resource, action);
    }

    collect() {
        let rds = null;
        const logger = this.logger;
        logger.debug('RDS Snapshot module collecting account: %j', this.accountConfig.name);
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(r => {rds = r;})
            .then(() => rds.describeDBSnapshots({}).promise())
            .then(function(r) {
                const dbSnapshots = r.DBSnapshots
                    .filter(function(xs) {
                        if (! (/^revolver-multiaz-/).test(xs.DBSnapshotIdentifier)) {
                            logger.info('RDS snapshot %s is not created by Revolver, skipping', xs.DBSnapshotIdentifier);
                            return false;
                        }
                        return true;
                    })
                    .filter(function(xs) {
                        if (xs.Status !== 'available') {
                            logger.info('RDS snapshot %s has status %s, must be available, skipping');
                            return false;
                        }
                        return true;
                    });
                logger.info('Found %d RDS snapshots', dbSnapshots.length);
                return dbSnapshots;
            })
            .then(r => r.map(xs => new InstrumentedRdsSnapshot(xs)))
            .then(r => Promise.all(r.map(function(xs) {
                return rds.listTagsForResource({ResourceName: xs.resourceArn}).promise()
                    .then(t => {xs.tags = t.TagList;})
                    .then(() => xs);
            })));
    }
}

module.exports = RdsSnapshotDriver;
