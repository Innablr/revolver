const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const assume = require('../lib/assume').default;
const { ToolingInterface } = require('./instrumentedResource');
const { DriverInterface, RDSTagger } = require('./driverInterface');
const { rdsTagger } = require('./tags');
const dateTime = require('../lib/dateTime');

class InstrumentedRdsMultiAz extends ToolingInterface {
    constructor(...args) {
        super(...args);
        this.tags = [];
    }

    get resourceId() {
        return this.resource.DBInstanceIdentifier;
    }

    get resourceArn() {
        return this.resource.DBInstanceArn;
    }

    get resourceType() {
        return 'rdsMultiAz';
    }

    get resourceState() {
        if (this.isAvailable) {
            return 'running';
        }
        return 'stopped';
    }

    get launchTimeUtc() {
        return moment(this.resource.InstanceCreateTime).tz('UTC');
    }

    get isAvailable() {
        return this.resource.DBInstanceStatus === 'available';
    }

    tag(key) {
        const tag = this.tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }
}


class RdsMultiAzDriver extends DriverInterface {
    start() {
        this.logger.debug('A multi-az RDS instance can\'t be started directly, ignoring');
        return Promise.resolve();
    }

    stopOneInstance(instance) {
        let rds = null;
        const logger = this.logger;
        const tzTagName = this.accountConfig.timezone_tag || 'Timezone';
        const tz = instance.tag(tzTagName) || this.accountConfig.timezone || 'utc';
        const locaTimeNow = dateTime.getTime(tz);
        const snapshotId = `revolver-multiaz-${instance.resourceId}-${locaTimeNow.format('YYYYMMDDhhmmss')}`;
        const snapshotArn = `arn:aws:rds:${this.accountConfig.region}:${assume.accountId(this.accountConfig.assumeRoleArn)}:snapshot:${snapshotId}`;
        const preserveTags = instance.tags.concat([
            {Key: 'revolver/db_subnet_group_name', Value: instance.resource.DBSubnetGroup.DBSubnetGroupName},
            {Key: 'revolver/db_security_groups', Value: instance.resource.VpcSecurityGroups.map(xr => xr.VpcSecurityGroupId).join('/')}
        ]);

        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(r => {rds = r;})
            .then(function() {
                logger.info('RDS instance %s will now be deleted with snapshot %s', instance.resourceId, snapshotId);
                return rds.deleteDBInstance({
                    DBInstanceIdentifier: instance.resourceId,
                    FinalDBSnapshotIdentifier: snapshotId,
                    SkipFinalSnapshot: false
                }).promise();
            })
            .then(function() {
                logger.debug('Saving instance %s tags in snapshot %s', instance.resourceId, snapshotId);
                return rds.addTagsToResource({
                    ResourceName: snapshotArn,
                    Tags: preserveTags
                }).promise();
            })
            .catch(function(err) {
                logger.error('Error stopping RDS instance %s, stack trace will follow:', instance.resourceId);
                logger.error(err);
            });
    }

    stop(resources) {
        const that = this;
        return Promise.all(resources.map(function(xr) {
            return that.stopOneInstance(xr);
        }));
    }

    maskstop(resource) {
        if (! resource.isAvailable) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is already in status ${resource.resource.DBInstanceStatus}`;
        }
        if (resource.resource.DBClusterIdentifier) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is part of cluster ${resource.resource.DBClusterIdentifier}`;
        }
        if (resource.resource.ReadReplicaSourceDBInstanceIdentifier) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is a read replica of ${resource.resource.ReadReplicaSourceDBInstanceIdentifier}`;
        }
        if (resource.resource.ReadReplicaDBInstanceIdentifiers && resource.resource.ReadReplicaDBInstanceIdentifiers.length) {
            return `RDS instance ${resource.resource.resource.DBInstanceIdentifier} has read replica instances`;
        }
        if (resource.resource.ReadReplicaDBClusterIdentifiers && resource.resource.ReadReplicaDBClusterIdentifiers.length) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replica clusters`;
        }
        if (resource.resource.MultiAZ === false) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is not multi-az`;
        }
        if (resource.resource.DBInstanceStatus !== 'available') {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is in state ${resource.resource.DBInstanceStatus}`;
        }
    }

    noop(resources, action) {
        this.logger.info('RDS instances %j will noop because: %s', resources.map(xr => xr.resourceId), action.reason);
        return Promise.resolve();
    }

    async setTag(resources, action) {
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const rds = new AWS.RDS({credentials: creds, region: this.accountConfig.region});

        return rdsTagger.setTag(rds, this.logger, resources, action);
    }

    masksetTag(resource, action) {
        return rdsTagger.masksetTag(resource, action);
    }

    async unsetTag(resources, action) {
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const rds = new AWS.RDS({credentials: creds, region: this.accountConfig.region});

        return rdsTagger.unsetTag(rds, this.logger, resources, action);
    }

    maskunsetTag(resource, action) {
        return rdsTagger.maskunsetTag(resource, action);
    }

    collect() {
        let rds = null;
        const logger = this.logger;
        const that = this;
        logger.debug('RDS MultiAZ module collecting account: %j', that.accountConfig.name);
        return assume.connectTo(that.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(r => {rds = r;})
            .then(() => rds.describeDBInstances({}).promise())
            .then(function(r) {
                const dbInstances = r.DBInstances
                    .filter(function(xi) {
                        if (xi.MultiAZ !== true) {
                            logger.info('RDS instance %s is not multi-az, skipping', xi.DBInstanceIdentifier);
                            return false;
                        }
                        return true;
                    });
                logger.debug('Found %d non-clustered multi-az RDS instances', dbInstances.length);
                return dbInstances;
            })
            .then(r => r.map(xr => new InstrumentedRdsMultiAz(xr)))
            .then(r => Promise.all(r.map(function(xr) {
                return rds.listTagsForResource({ResourceName: xr.resourceArn}).promise()
                    .then(t => {xr.tags = t.TagList;})
                    .then(() => xr);
            })));
    }
}

module.exports = RdsMultiAzDriver;
