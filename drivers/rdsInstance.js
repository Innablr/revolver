const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const assume = require('../lib/assume');
const ToolingInterface = require('../plugins/toolingInterface');
const {DriverInterface, RDSTagger} = require('./driverInterface');

class InstrumentedRdsInstance extends ToolingInterface {
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
        return 'rdsInstance';
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


class RdsInstanceDriver extends DriverInterface {
    start(resources) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(function(rds) {
                return Promise.all(resources.map(function(xr) {
                    logger.info('RDS instance %s will start', xr.resourceId);
                    return rds.startDBInstance({DBInstanceIdentifier: xr.resourceId}).promise()
                        .catch(function(err) {
                            logger.error('Error starting RDS instance %s, stack trace will follow:', xr.resourceId);
                            logger.error(err);
                        });
                }));
            });
    }

    maskstart(resource) {
        if (resource.isAvailable) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is already in status ${resource.resource.DBInstanceStatus}`;
        }
        if (resource.resource.DBClusterIdentifier) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is part of cluster ${resource.resource.DBClusterIdentifier}`;
        }
        if (resource.resource.ReadReplicaSourceDBInstanceIdentifier) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is a read replica of ${resource.resource.ReadReplicaSourceDBInstanceIdentifier}`;
        }
        if (resource.resource.ReadReplicaDBInstanceIdentifiers !== undefined && resource.resource.ReadReplicaDBInstanceIdentifiers.length) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replicas`;
        }
        if (resource.resource.ReadReplicaDBClusterIdentifiers !== undefined && resource.resource.ReadReplicaDBClusterIdentifiers.length) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replica clusters`;
        }
        if (resource.resource.MultiAZ === true) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is multi-az`;
        }
    }

    stop(resources) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(function(rds) {
                return Promise.all(resources.map(function(xr) {
                    if (xr.resource.DBInstanceStatus !== 'available') {
                        logger.info('RDS instance %s can\'t be stopped, status [%s]', xr.resourceId, xr.resource.DBInstanceStatus);
                        return Promise.resolve();
                    }
                    logger.info('RDS instance %s will stop', xr.resourceId);
                    return rds.stopDBInstance({DBInstanceIdentifier: xr.resourceId}).promise()
                        .catch(function(err) {
                            logger.error('Error stopping RDS instance %s, stack trace will follow:', xr.resourceId);
                            logger.error(err);
                        });
                }));
            });
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
        if (resource.resource.ReadReplicaDBInstanceIdentifiers.length || resource.resource.ReadReplicaDBClusterIdentifiers.length) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replicas`;
        }
        if (resource.resource.MultiAZ === true) {
            return `RDS instance ${resource.resource.DBInstanceIdentifier} is multi-az`;
        }
    }

    noop(resources, action) {
        this.logger.info('RDS instances %j will noop because: %s', resources.map(xr => xr.resourceId), action.reason);
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
        const that = this;
        const logger = this.logger;
        logger.debug('RDS module collecting account: %j', that.accountConfig.name);
        return assume.connectTo(that.accountConfig.assumeRoleArn)
            .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            .then(rds => rds.describeDBInstances({}).promise())
            .then(function(r) {
                const dbInstances = r.DBInstances
                    .filter(function(xi) {
                        if (xi.MultiAZ === true) {
                            logger.info('RDS instance %s is multi-az, skipping', xi.DBInstanceIdentifier);
                            return false;
                        }
                        return true;
                    });
                logger.debug('Found %d non-clustered RDS instances', dbInstances.length);
                return dbInstances;
            })
            .then(r => r.map(xr => new InstrumentedRdsInstance(xr)))
            .then(r => Promise.all([
                Promise.resolve(r),
                assume.connectTo(that.accountConfig.assumeRoleArn)
                    .then(creds => new AWS.RDS({credentials: creds, region: this.accountConfig.region}))
            ]))
            .then(([r, rds]) => Promise.all(r.map(function(xr) {
                return rds.listTagsForResource({ResourceName: xr.resourceArn}).promise()
                    .then(t => {xr.tags = t.TagList;})
                    .then(() => xr);
            })));
    }
}

module.exports = RdsInstanceDriver;