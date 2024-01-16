import { DateTime } from 'luxon';
import { Redshift } from 'aws-sdk';
import assume from '../lib/assume';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import dateTime from '../lib/dateTime';

class InstrumentedRedshiftCluster extends ToolingInterface {
  public tags: Redshift.Tag[] = [];
  private clusterARN: string;

  constructor(resource: Redshift.Cluster, clusterARN: string) {
    super(resource);
    this.clusterARN = clusterARN;
  }

  get resourceId() {
    return this.resource.ClusterIdentifier;
  }

  get resourceType() {
    return 'redshiftCluster';
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.ClusterCreateTime).setZone('UTC');
  }

  get nodes() {
    return this.resource.ClusterNodes;
  }

  get leaderNode() {
    return this.nodes.find((c: any) => c.NodeRole === 'LEADER');
  }

  get singleNode() {
    return this.nodes.find((c: any) => c.NodeRole === 'SHARED');
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

  get resourceArn() {
    return `arn:aws:redshift:us-east-2:123456789:cluster:t1`;
  }

  tag(key: string) {
    const tag = this.tags.find((xt) => xt.Key === key);
    return tag?.Value;
  }
}

class RedshiftClusterDriver extends DriverInterface {
  start() {
    this.logger.debug("An redshift cluster can't be started directly, ignoring");
    return Promise.resolve();
  }

  stopOneCluster(cluster: InstrumentedRedshiftCluster) {
    let redshift: Redshift;
    const logger = this.logger;
    const tzTagName = this.accountConfig.timezone_tag || 'Timezone';
    const tz = cluster.tag(tzTagName) || this.accountConfig.timezone || 'utc';
    const locaTimeNow = dateTime.getTime(tz);
    const snapshotId = `revolver-cluster-${cluster.resourceId}-${locaTimeNow.toFormat('yyyyLLddHHmmss')}`;
    const snapshotArn = `arn:aws:redshift:${this.accountConfig.region}:${assume.accountId(this.accountConfig.assumeRoleArn)}:snapshot:${cluster.resourceId}/${snapshotId}`;

    const preserveTags = cluster.resource.Tags.concat([
      { Key: 'revolver/cluster_subnet_group_name', Value: cluster.resource.ClusterSubnetGroupName },
      {
        Key: 'revolver/vpc_security_groups',
        Value: cluster.resource.VpcSecurityGroups.map((xr: any) => xr.VpcSecurityGroupId).join('/'),
      },
      { Key: 'revolver/db_name', Value: cluster.resource.DBName || 'dev' },
      { Key: 'revolver/vpc_id', Value: cluster.resource.VpcId },
      { Key: 'revolver/availability_zone', Value: cluster.resource.AvailabilityZone },
      { Key: 'revolver/node_type', Value: cluster.resource.NodeType },
      { Key: 'revolver/nodes_number', Value: cluster.resource.NumberOfNodes.toString() },
      { Key: 'revolver/cluster_port', Value: cluster.resource.Endpoint.Port.toString() },
    ]);

    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new Redshift({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        redshift = r;
      })
      .then(function () {
        logger.info('Redshift cluster %s will now be deleted with snapshot %s', cluster.resourceId, snapshotId);
        return redshift
          .deleteCluster({
            ClusterIdentifier: cluster.resourceId,
            FinalClusterSnapshotIdentifier: snapshotId,
            SkipFinalClusterSnapshot: false,
          })
          .promise();
      })
      .then(function () {
        logger.debug('Saving cluster %s tags in snapshot %s', cluster.resourceId, snapshotId);
        return redshift
          .createTags({
            ResourceName: snapshotArn,
            Tags: preserveTags,
          })
          .promise();
      })
      .catch(function (err) {
        logger.error('Error stopping Redshift cluster %s, stack trace will follow:', cluster.resourceId);
        logger.error(err);
      });
  }

  stop(resources: InstrumentedRedshiftCluster[]) {
    return Promise.all(resources.map((xr) => this.stopOneCluster(xr)));
  }

  maskstop(resource: InstrumentedRedshiftCluster) {
    if (!resource.isAvailable) {
      return `Cluster ${resource.resourceId} or one of its instances is not in available state`;
    }
    return undefined;
  }

  noop(resources: InstrumentedRedshiftCluster[], action: RevolverAction) {
    this.logger.info(
      'Redshift clusters %j will noop because: %s',
      resources.map((xr) => xr.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  setTag(resources: InstrumentedRedshiftCluster[], action: RevolverActionWithTags) {
    const logger = this.logger;
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new Redshift({ credentials: creds, region: this.accountConfig.region }))
      .then(function (redshift) {
        return Promise.all(
          resources.map(function (xr) {
            const safeValues = action.tags.map((xt) => ({
              Key: xt.Key,
              Value: xt.Value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_'),
            }));
            logger.info('Redshift cluster %s will be set tags %j', xr.resourceId, safeValues);
            return redshift
              .createTags({
                ResourceName: xr.resourceArn,
                Tags: safeValues,
              })
              .promise()
              .catch(function (err) {
                logger.error('Error settings tags for Redshift cluster %s, stack trace will follow:', xr.resourceId);
                logger.error(err);
              });
          }),
        );
      });
  }

  masksetTag(resource: InstrumentedRedshiftCluster, action: RevolverActionWithTags) {
    if (action.tags.every((xt) => resource.tag(xt.Key) === xt.Value)) {
      return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }

  unsetTag(resources: InstrumentedRedshiftCluster[], action: RevolverActionWithTags) {
    const logger = this.logger;
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new Redshift({ credentials: creds, region: this.accountConfig.region }))
      .then(function (redshift) {
        return Promise.all(
          resources.map(function (xr) {
            logger.info(
              'Redshift cluster %s will be unset tags %s',
              xr.resourceId,
              action.tags.map((xt) => xt.Key),
            );
            return redshift
              .deleteTags({
                ResourceName: xr.resourceArn,
                TagKeys: action.tags.map((xt) => xt.Key),
              })
              .promise()
              .catch(function (err) {
                logger.error('Error unsettings tags for Redshift cluster %s, stack trace will follow:', xr.resourceId);
                logger.error(err);
              });
          }),
        );
      });
  }

  maskunsetTag(resource: InstrumentedRedshiftCluster, action: RevolverActionWithTags) {
    if (action.tags.every((xt) => resource.tag(xt.Key) === undefined)) {
      return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }

  async collect() {
    const logger = this.logger;
    logger.debug('Redshift Cluster module collecting account: %j', this.accountConfig.name);

    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const redshift = await new Redshift({
      credentials: creds,
      region: this.accountConfig.region,
      apiVersion: '2012-12-01',
    });

    const redshiftClusters =
      (await redshift
        .describeClusters({})
        .promise()
        .then((c) => c.Clusters)) || [];

    logger.info('Found %d Redshift clusters', redshiftClusters.length);

    return await Promise.all(
      redshiftClusters.map(
        (cluster) =>
          new InstrumentedRedshiftCluster(
            cluster,
            `arn:aws:redshift:${this.accountConfig.region}:${this.Id}:cluster:${cluster.ClusterIdentifier}`,
          ),
      ),
    );
  }
}

export default RedshiftClusterDriver;
