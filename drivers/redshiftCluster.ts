import { DateTime } from 'luxon';
import { Cluster, CreateTagsCommand, DeleteClusterCommand, DeleteTagsCommand, DescribeClustersCommand, RedshiftClient, Tag } from '@aws-sdk/client-redshift';
import assume from '../lib/assume';
import { InstrumentedResource, ToolingInterface } from "./instrumentedResource";
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import dateTime from '../lib/dateTime';
import { getAwsClientForAccount } from '../lib/awsConfig';

class InstrumentedRedshiftCluster extends ToolingInterface {
  public tags: Tag[] = [];
  private clusterARN: string;

  constructor(resource: Cluster, clusterARN: string) {
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
    let redshift: RedshiftClient;
    const logger = this.logger;
    const tzTagName = this.accountConfig.timezoneTag;
    const tz = cluster.tag(tzTagName) || this.accountConfig.timezone;
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

    return getAwsClientForAccount(RedshiftClient, this.accountConfig)
      .then((r) => {
        redshift = r;
      })
      .then(function () {
        logger.info(`Redshift cluster ${cluster.resourceId} will now be deleted with snapshot ${snapshotId}`);
        return redshift.send(new DeleteClusterCommand({
          ClusterIdentifier: cluster.resourceId,
          FinalClusterSnapshotIdentifier: snapshotId,
          SkipFinalClusterSnapshot: false,
        }));
      })
      .then(function () {
        logger.debug(`Saving cluster ${cluster.resourceId} tags in snapshot ${snapshotId}`);
        return redshift.send(new CreateTagsCommand({
          ResourceName: snapshotArn,
          Tags: preserveTags,
        }));
      })
      .catch(function (err) {
        logger.error(`Error stopping Redshift cluster ${cluster.resourceId}, stack trace will follow`, err);
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
    this.logger.info(`Redshift clusters ${resources.map((xr) => xr.resourceId)} will noop because: ${action.reason}`);
    return Promise.resolve();
  }

  setTag(resources: InstrumentedRedshiftCluster[], action: RevolverActionWithTags) {
    const logger = this.logger;
    return getAwsClientForAccount(RedshiftClient, this.accountConfig).then(function (redshift) {
      return Promise.all(
        resources.map(function (xr) {
          const safeValues = action.tags.map((xt) => ({
            Key: xt.Key,
            Value: xt.Value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_'),
          }));
          logger.info(`Redshift cluster ${xr.resourceId} will be set tags ${safeValues}`);
          return redshift
            .send(new CreateTagsCommand({
              ResourceName: xr.resourceArn,
              Tags: safeValues,
            }))
            .catch(function (err) {
              logger.error(`Error settings tags for Redshift cluster ${xr.resourceId}, stack trace will follow`, err);
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
    return getAwsClientForAccount(RedshiftClient, this.accountConfig).then(function (redshift) {
      return Promise.all(
        resources.map(function (xr) {
          logger.info(`Redshift cluster ${xr.resourceId} will be unset tags ${action.tags.map((xt) => xt.Key)}`);
          return redshift
            .send(new DeleteTagsCommand({
              ResourceName: xr.resourceArn,
              TagKeys: action.tags.map((xt) => xt.Key),
            }))
            .catch(function (err) {
              logger.error(`Error unsettings tags for Redshift cluster ${xr.resourceId}, stack trace will follow`, err);
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
    logger.debug(`Redshift Cluster module collecting account:${this.accountConfig.name}`);

    const redshift = await getAwsClientForAccount(RedshiftClient, this.accountConfig);

    const redshiftClusters = (await redshift.send(new DescribeClustersCommand({})).then((c) => c.Clusters)) || [];

    logger.info(`Found ${redshiftClusters.length} Redshift clusters`);

    return await Promise.all(
      redshiftClusters.map(
        (cluster) =>
          new InstrumentedRedshiftCluster(
            cluster,
            `arn:aws:redshift:${this.accountConfig.region}:${this.accountId}:cluster:${cluster.ClusterIdentifier}`,
          ),
      ),
    );
  }
  resource(obj: InstrumentedResource): ToolingInterface {
    return new InstrumentedRedshiftCluster(obj.resource, obj.resourceArn);
  }
}

export default RedshiftClusterDriver;
