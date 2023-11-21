const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const assume = require('../lib/assume');
const ToolingInterface = require('../plugins/toolingInterface');
const {DriverInterface} = require('./driverInterface');

class InstrumentedRedshiftClusterSnapshot extends ToolingInterface {
    constructor(...args) {
        super(...args);
        this.tags = [];
    }

    get resourceId() {
        return this.resource.SnapshotIdentifier;
    }

    get resourceType() {
        return 'redshiftClusterSnapshot';
    }

    get launchTimeUtc() {
        return moment(this.resource.SnapshotCreateTime).tz('UTC');
    }

    get resourceState() {
        return this.resource.Status;
    }

    tag(key) {
        const tag = this.resource.Tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }
}


class RedshiftClusterSnapshotDriver extends DriverInterface {
    startOneSnapshot(snapshot) {
        let redshift = null;
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.Redshift({ credentials: creds, region: this.accountConfig.region }))
            .then(r => { redshift = r; })
            .then(async function () {
                logger.info('Checking if Redshift Cluster %s have been restored before..', snapshot.resource.ClusterIdentifier);
                const clusterRestored = await redshift.describeClusters({ ClusterIdentifier: snapshot.resource.ClusterIdentifier }).promise().then(r => r.Clusters).catch(() => false);
                if (clusterRestored) {
                    if (clusterRestored[0].ClusterStatus === 'available') {
                        logger.info('Redshift Cluster %s is already running, erasing Redshift snapshot %s ..', snapshot.resourceId);
                        return redshift.deleteClusterSnapshot({ SnapshotIdentifier: snapshot.resourceId }).promise();
                    }
                }

                logger.info('Redshift Cluster %s will now be restored from snapshot %s', snapshot.resource.ClusterIdentifier, snapshot.resourceId);
                const sgTag = snapshot.tag('revolver/vpc_security_groups');
                const opts = {
                    ClusterIdentifier: snapshot.resource.ClusterIdentifier,
                    SnapshotIdentifier: snapshot.resourceId,
                    AvailabilityZone: snapshot.resource.AvailabilityZone,
                    ClusterSubnetGroupName: snapshot.tag('revolver/cluster_subnet_group_name'),
                    Port: parseInt(snapshot.tag('revolver/cluster_port'), 10)
                };
                if (sgTag !== undefined) {
                    opts.VpcSecurityGroupIds = sgTag.split('/');
                }
                return redshift.restoreFromClusterSnapshot(opts).promise();
            })
            .catch(function (err) {
                logger.error('Error restoring Redshift snapshot %s, stack trace will follow:', snapshot.resourceId);
                logger.error(err);
            });
    }

    start(resources) {
        return Promise.all(resources.map(xs => this.startOneSnapshot(xs)));
    }

    maskstart(resource) {
        if (resource.tag('revolver/restore_commenced') !== undefined) {
            return `Redshift snapshot ${resource.resourceId} already started restoring at ${resource.tag('revolver/restore_commenced')}`;
        }
        if (resource.resource.Status !== 'available') {
            return `Redshift cluster snapshot ${resource.resourceId} is in state ${resource.resourceState}`;
        }
    }

    stop() {
        this.logger.debug('A Redshift snapshot can\'t be stopped directly, ignoring action');
        return Promise.resolve();
    }

    maskstop(resource) {
        return `Redshift Snapshot ${resource.resourceId} can't be stopped`;
    }

    noop(resources, action) {
        this.logger.info('Redshift snapshots %j will noop because: %s', resources.map(xs => xs.resourceId), action.reason);
        return Promise.resolve();
    }

    setTag(resources, action) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.Redshift({ credentials: creds, region: this.accountConfig.region }))
            .then(function (redshift) {
                return Promise.all(resources.map(function (xs) {
                    const safeValue = action.value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_');
                    logger.info('Redshift snapshot %s will be set tag %s=%s', xs.resourceId, action.tag, safeValue);
                    return redshift.createTags({
                        ResourceName: xs.resourceArn,
                        Tags: [
                            {
                                Key: action.tag,
                                Value: safeValue
                            }
                        ]
                    }).promise()
                        .catch(function (err) {
                            logger.error('Error settings tags for Redshift snapshot %s, stack trace will follow:', xs.resourceId);
                            logger.error(err);
                        });
                }));
            });
    }

    masksetTag(resource, action) {
        if (resource.tag(action.tag) === action.value) {
            return `Tag ${action.tag} = ${action.value} already exists`;
        }
    }

    unsetTag(resources, action) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.Redshift({ credentials: creds, region: this.accountConfig.region }))
            .then(function (redshift) {
                return Promise.all(resources.map(function (xs) {
                    if (xs.tag(action.tag) === undefined) {
                        logger.info('Redshift snapshot %s doesn\'t have tag %s, skipping...', xs.resourceId, action.tag);
                        return Promise.resolve();
                    }
                    logger.info('Redshift snapshot %s will be unset tag %s', xs.resourceId, action.tag);
                    return redshift.deleteTags({
                        ResourceName: xs.resourceArn,
                        TagKeys: [action.tag]
                    }).promise()
                        .catch(function (err) {
                            logger.error('Error unsettings tags for Redshift snapshot %s, stack trace will follow:', xs.resourceId);
                            logger.error(err);
                        });
                }));
            });
    }

    maskunsetTag(resource, action) {
        if (resource.tag(action.tag) === undefined) {
            return `Tag ${action.tag} doesn't exist`;
        }
    }

    async collect() {
        const logger = this.logger;
        const that = this;
        logger.debug('Redshift Cluster Snapshot module collecting account: %j', this.accountConfig.name);

        const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);
        const redshift = await new AWS.Redshift({ credentials: creds, region: this.accountConfig.region });

        const redshiftClusterSnapshots = await redshift.describeClusterSnapshots({}).promise()
            .then(c => c.Snapshots.filter(ss => {
                if (!(/^revolver-cluster-/).test(ss.SnapshotIdentifier)) {
                    logger.info('Redshift snapshot %s is not created by Revolver, skipping', ss.SnapshotIdentifier);
                    return false;
                }
                return true;
            }))
            .then(r => r.map(xs => new InstrumentedRedshiftClusterSnapshot(xs)))
            .then(r => Promise.all(r.map(function (xs) {
                return redshift.describeTags({ ResourceName: xs.resourceArn }).promise()
                    .then(t => { xs.tags = t.TagList; })
                    .then(() => xs);
            })))
            .then(async (r) => {
                return await Promise.all(r.map(c => {
                    c.resourceArn = `arn:aws:redshift:${that.accountConfig.region}:${that.Id}:snapshot:${c.resource.ClusterIdentifier}/${c.resourceId}`;
                    return c;
                }));
            });;

        return redshiftClusterSnapshots;
    }
}

module.exports = RedshiftClusterSnapshotDriver;