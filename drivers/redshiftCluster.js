const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const assume = require('../lib/assume').default;
const { ToolingInterface } = require('./instrumentedResource');
const { DriverInterface } = require('./driverInterface');
const dateTime = require('../lib/dateTime');

class InstrumentedRedshiftCluster extends ToolingInterface {
    constructor(...args) {
        super(...args);
        this.tags = [];
    }

    get resourceId() {
        return this.resource.ClusterIdentifier;
    }

    get resourceType() {
        return 'redshiftCluster';
    }

    get launchTimeUtc() {
        return moment(this.resource.ClusterCreateTime).tz('UTC');
    }

    get nodes() {
        return this.resource.ClusterNodes;
    }

    get leaderNode() {
        return this.nodes.find(c => c.NodeRole === 'LEADER');
    }

    get singleNode() {
        return this.nodes.find(c => c.NodeRole === 'SHARED')
    }

    get resourceState() {
        return this.resource.ClusterStatus;
    }

    get isAvailable() {
        return this.resourceState === 'available';
    }

    get isSingleNode() {
        return this.singleNode ? true : false;
    }

    tag(key) {
        const tag = this.resource.Tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }
}


class RedshiftClusterDriver extends DriverInterface {
    start() {
        this.logger.debug('An redshift cluster can\'t be started directly, ignoring');
        return Promise.resolve();
    }

    stopOneCluster(cluster) {
        let redshift = null;
        const logger = this.logger;
        const tzTagName = this.accountConfig.timezone_tag || 'Timezone';
        const tz = cluster.tag(tzTagName) || this.accountConfig.timezone || 'utc';
        const locaTimeNow = dateTime.getTime(tz);
        const snapshotId = `revolver-cluster-${cluster.resourceId}-${locaTimeNow.format('YYYYMMDDhhmmss')}`;
        const snapshotArn = `arn:aws:redshift:${this.accountConfig.region}:${assume.accountId(this.accountConfig.assumeRoleArn)}:snapshot:${cluster.resourceId}/${snapshotId}`;

        const preserveTags = cluster.resource.Tags
            .concat([
                { Key: 'revolver/cluster_subnet_group_name', Value: cluster.resource.ClusterSubnetGroupName },
                { Key: 'revolver/vpc_security_groups', Value: cluster.resource.VpcSecurityGroups.map(xr => xr.VpcSecurityGroupId).join('/') },
                { Key: 'revolver/db_name', Value: cluster.resource.DBName || 'dev' },
                { Key: 'revolver/vpc_id', Value: cluster.resource.VpcId },
                { Key: 'revolver/availability_zone', Value: cluster.resource.AvailabilityZone },
                { Key: 'revolver/node_type', Value: cluster.resource.NodeType },
                { Key: 'revolver/nodes_number', Value: cluster.resource.NumberOfNodes.toString() },
                { Key: 'revolver/cluster_port', Value: cluster.resource.Endpoint.Port.toString() }
            ]);

        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.Redshift({ credentials: creds, region: this.accountConfig.region }))
            .then(r => { redshift = r; })
            .then(function () {
                logger.info('Redshift cluster %s will now be deleted with snapshot %s', cluster.resourceId, snapshotId);
                return redshift.deleteCluster({
                    ClusterIdentifier: cluster.resourceId,
                    FinalClusterSnapshotIdentifier: snapshotId,
                    SkipFinalClusterSnapshot: false
                }).promise();
            })
            .then(function () {
                logger.debug('Saving cluster %s tags in snapshot %s', cluster.resourceId, snapshotId);
                return redshift.createTags({
                    ResourceName: snapshotArn,
                    Tags: preserveTags
                }).promise();
            })
            .catch(function (err) {
                logger.error('Error stopping Redshift cluster %s, stack trace will follow:', cluster.resourceId);
                logger.error(err);
            });
    }

    stop(resources) {
        const that = this;
        return Promise.all(resources.map(xr => that.stopOneCluster(xr)));
    }

    maskstop(resource) {
        if (!resource.isAvailable) {
            return `Cluster ${resource.resourceId} or one of its instances is not in available state`;
        }
    }

    noop(resources, action) {
        this.logger.info('Redshift clusters %j will noop because: %s', resources.map(xr => xr.resourceId), action.reason);
        return Promise.resolve();
    }

    setTag(resources, action) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.Redshift({ credentials: creds, region: this.accountConfig.region }))
            .then(function (redshift) {
                return Promise.all(resources.map(function (xr) {
                    const safeValue = action.value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_');
                    logger.info('Redshift cluster %s will be set tag %s=%s', xr.resourceId, action.tag, safeValue);
                    return redshift.createTags({
                        ResourceName: xr.clusterArn,
                        Tags: [
                            {
                                Key: action.tag,
                                Value: safeValue
                            }
                        ]
                    }).promise()
                        .catch(function (err) {
                            logger.error('Error settings tags for Redshift cluster %s, stack trace will follow:', xr.resourceId);
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
                return Promise.all(resources.map(function (xr) {
                    if (xr.tag(action.tag) === undefined) {
                        logger.info('Redshift cluster %s doesn\'t have tag %s, skipping...', xr.resourceId, action.tag);
                        return Promise.resolve();
                    }
                    logger.info('Redshift cluster %s will be unset tag %s', xr.resourceId, action.tag);
                    return redshift.deleteTags({
                        ResourceName: xr.clusterArn,
                        TagKeys: [action.tag]
                    }).promise()
                        .catch(function (err) {
                            logger.error('Error unsettings tags for Redshift cluster %s, stack trace will follow:', xr.resourceId);
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
        logger.debug('Redshift Cluster module collecting account: %j', that.accountConfig.name);

        const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);
        const redshift = await new AWS.Redshift({ credentials: creds, region: this.accountConfig.region, apiVersion: '2012-12-01' });

        const redshiftClusters = await redshift.describeClusters({}).promise().then(c => c.Clusters);

        logger.info('Found %d Redshift clusters', redshiftClusters.length);

        return await Promise.all(
            redshiftClusters.map(cluster => new InstrumentedRedshiftCluster(cluster))
        ).then(async (r) => {
            return await Promise.all(r.map(c => {
                c.clusterArn = `arn:aws:redshift:${that.accountConfig.region}:${that.Id}:cluster:${c.resourceId}`;
                return c;
            }));
        });
    }
}

module.exports = RedshiftClusterDriver;
