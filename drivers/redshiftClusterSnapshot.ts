import { DateTime } from 'luxon';
import { Cluster, CreateTagsCommand, DeleteClusterSnapshotCommand, DeleteTagsCommand, DescribeClusterSnapshotsCommand, DescribeClustersCommand, DescribeTagsCommand, RedshiftClient, RestoreFromClusterSnapshotCommand, Tag } from '@aws-sdk/client-redshift';
import { InstrumentedResource, ToolingInterface } from "./instrumentedResource";
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { getAwsClientForAccount } from '../lib/awsConfig';

class InstrumentedRedshiftClusterSnapshot extends ToolingInterface {
  public tags: Tag[] = [];
  private snapshotARN: string;

  constructor(resource: Cluster, snapshotARN: string) {
    super(resource);
    this.snapshotARN = snapshotARN;
  }

  get resourceId() {
    return this.resource.SnapshotIdentifier;
  }

  get resourceType() {
    return 'redshiftClusterSnapshot';
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.SnapshotCreateTime).setZone('UTC');
  }

  get resourceState() {
    return this.resource.Status;
  }

  get resourceArn() {
    return this.snapshotARN;
  }

  tag(key: string) {
    const tag = this.tags.find((xt) => xt.Key === key);
    return tag?.Value;
  }
}

class RedshiftClusterSnapshotDriver extends DriverInterface {
  startOneSnapshot(snapshot: InstrumentedRedshiftClusterSnapshot) {
    let redshift: RedshiftClient;
    const logger = this.logger;
    return getAwsClientForAccount(RedshiftClient, this.accountConfig)
      .then((r) => {
        redshift = r;
      })
      .then(async function () {
        logger.info(`Checking if Redshift Cluster ${snapshot.resource.ClusterIdentifier} have been restored before..`);
        const clusterRestored: Array<Cluster> = await redshift
          .send(new DescribeClustersCommand({ ClusterIdentifier: snapshot.resource.ClusterIdentifier }))
          .then((r) => r.Clusters!);

        if (clusterRestored) {
          if (clusterRestored[0].ClusterStatus === 'available') {
            logger.info(`Redshift Cluster ${snapshot.resource.ClusterIdentifier} is already running, erasing Redshift snapshot ${snapshot.resourceId}..`);
            return redshift.send(new DeleteClusterSnapshotCommand({ SnapshotIdentifier: snapshot.resourceId }));
          }
        }

        logger.info(
          'Redshift Cluster %s will now be restored from snapshot %s',
          snapshot.resource.ClusterIdentifier,
          snapshot.resourceId,
        );
        const sgTag = snapshot.tag('revolver/vpc_security_groups');
        const opts = {
          ClusterIdentifier: snapshot.resource.ClusterIdentifier,
          SnapshotIdentifier: snapshot.resourceId,
          AvailabilityZone: snapshot.resource.AvailabilityZone,
          ClusterSubnetGroupName: snapshot.tag('revolver/cluster_subnet_group_name'),
          Port: parseInt(snapshot.tag('revolver/cluster_port') || '0', 10),
          VpcSecurityGroupIds: [] as string[],
        };
        if (sgTag !== undefined) {
          opts.VpcSecurityGroupIds = sgTag.split('/');
        }
        return redshift.send(new RestoreFromClusterSnapshotCommand(opts));
      })
      .catch(function (err) {
        logger.error(`Error restoring Redshift snapshot ${snapshot.resourceId}, stack trace will follow`, err);
      });
  }

  start(resources: InstrumentedRedshiftClusterSnapshot[]) {
    return Promise.all(resources.map((xs) => this.startOneSnapshot(xs)));
  }

  maskstart(resource: InstrumentedRedshiftClusterSnapshot) {
    if (resource.tag('revolver/restore_commenced') !== undefined) {
      return `Redshift snapshot ${resource.resourceId} already started restoring at ${resource.tag('revolver/restore_commenced')}`;
    }
    if (resource.resource.Status !== 'available') {
      return `Redshift cluster snapshot ${resource.resourceId} is in state ${resource.resourceState}`;
    }
    return undefined;
  }

  stop() {
    this.logger.debug("A Redshift snapshot can't be stopped directly, ignoring action");
    return Promise.resolve();
  }

  maskstop(resource: InstrumentedRedshiftClusterSnapshot) {
    return `Redshift Snapshot ${resource.resourceId} can't be stopped`;
  }

  noop(resources: InstrumentedRedshiftClusterSnapshot[], action: RevolverAction) {
    this.logger.info(
      'Redshift snapshots %j will noop because: %s',
      resources.map((xs) => xs.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  setTag(resources: InstrumentedRedshiftClusterSnapshot[], action: RevolverActionWithTags) {
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

  masksetTag(resource: InstrumentedRedshiftClusterSnapshot, action: RevolverActionWithTags) {
    if (action.tags.every((xt) => resource.tag(xt.Key) === xt.Value)) {
      return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }

  unsetTag(resources: InstrumentedRedshiftClusterSnapshot[], action: RevolverActionWithTags) {
    const logger = this.logger;
    return getAwsClientForAccount(RedshiftClient, this.accountConfig).then(function (redshift) {
      return Promise.all(
        resources.map(function (xs) {
          logger.info(
            'Redshift snapshot %s will be unset tags %s',
            xs.resourceId,
            action.tags.map((xt) => xt.Key),
          );
          return redshift
            .send(new DeleteTagsCommand({
              ResourceName: xs.resourceArn,
              TagKeys: action.tags.map((xt) => xt.Key),
            }))
            .catch(function (err) {
              logger.error(`Error unsettings tags for Redshift snapshot ${xs.resourceId}, stack trace will follow`, err);
            });
        }),
      );
    });
  }

  maskunsetTag(resource: InstrumentedRedshiftClusterSnapshot, action: RevolverActionWithTags) {
    if (action.tags.every((xt) => resource.tag(xt.Key) === undefined)) {
      return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }

  async collect() {
    const logger = this.logger;
    logger.debug(`Redshift Cluster Snapshot module collecting account: ${this.accountConfig.name}`);

    const redshift = await getAwsClientForAccount(RedshiftClient, this.accountConfig);

    const redshiftClusterSnapshots = await redshift
      .send(new DescribeClusterSnapshotsCommand({}))
      .then((c) =>
        c.Snapshots!.filter((ss) => {
          if (!/^revolver-cluster-/.test(ss.SnapshotIdentifier || '')) {
            logger.info(`Redshift snapshot ${ss.SnapshotIdentifier} is not created by Revolver, skipping`);
            return false;
          }
          return true;
        }),
      )
      .then((r) =>
        r.map(
          (xs) =>
            new InstrumentedRedshiftClusterSnapshot(
              xs,
              `arn:aws:redshift:${this.accountConfig.region}:${this.accountId}:snapshot:${xs.ClusterIdentifier}/${xs.SnapshotIdentifier}`,
            ),
        ),
      )
      .then((r) =>
        Promise.all(
          r.map(function (xs) {
            return redshift
              .send(new DescribeTagsCommand({ ResourceName: xs.resourceArn }))
              .then((t) => {
                xs.tags = t.TaggedResources!.map((xt) => xt.Tag).filter((xt) => xt) as Tag[];
              })
              .then(() => xs);
          }),
        ),
      );

    return redshiftClusterSnapshots;
  }
  resource(obj: InstrumentedResource): ToolingInterface {
    return new InstrumentedRedshiftClusterSnapshot(obj.resource, obj.resourceArn)
  }
}

export default RedshiftClusterSnapshotDriver;
