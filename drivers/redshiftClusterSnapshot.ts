import { DateTime } from 'luxon';
import { Redshift } from 'aws-sdk';
import assume from '../lib/assume';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';

class InstrumentedRedshiftClusterSnapshot extends ToolingInterface {
  public tags: Redshift.Tag[] = [];
  private snapshotARN: string;

  constructor(resource: Redshift.Cluster, snapshotARN: string) {
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
    let redshift: Redshift;
    const logger = this.logger;
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new Redshift({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        redshift = r;
      })
      .then(async function () {
        logger.info('Checking if Redshift Cluster %s have been restored before..', snapshot.resource.ClusterIdentifier);
        const clusterRestored: Redshift.ClusterList = await redshift
          .describeClusters({ ClusterIdentifier: snapshot.resource.ClusterIdentifier })
          .promise()
          .then((r) => r.Clusters!);

        if (clusterRestored) {
          if (clusterRestored[0].ClusterStatus === 'available') {
            logger.info('Redshift Cluster %s is already running, erasing Redshift snapshot %s ..', snapshot.resourceId);
            return redshift.deleteClusterSnapshot({ SnapshotIdentifier: snapshot.resourceId }).promise();
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
        return redshift.restoreFromClusterSnapshot(opts).promise();
      })
      .catch(function (err) {
        logger.error('Error restoring Redshift snapshot %s, stack trace will follow:', snapshot.resourceId);
        logger.error(err);
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
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new Redshift({ credentials: creds, region: this.accountConfig.region }))
      .then(function (redshift) {
        return Promise.all(
          resources.map(function (xs) {
            logger.info(
              'Redshift snapshot %s will be unset tags %s',
              xs.resourceId,
              action.tags.map((xt) => xt.Key),
            );
            return redshift
              .deleteTags({
                ResourceName: xs.resourceArn,
                TagKeys: action.tags.map((xt) => xt.Key),
              })
              .promise()
              .catch(function (err) {
                logger.error('Error unsettings tags for Redshift snapshot %s, stack trace will follow:', xs.resourceId);
                logger.error(err);
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
    logger.debug('Redshift Cluster Snapshot module collecting account: %j', this.accountConfig.name);

    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const redshift = new Redshift({ credentials: creds, region: this.accountConfig.region });

    const redshiftClusterSnapshots = await redshift
      .describeClusterSnapshots({})
      .promise()
      .then((c) =>
        c.Snapshots!.filter((ss) => {
          if (!/^revolver-cluster-/.test(ss.SnapshotIdentifier || '')) {
            logger.info('Redshift snapshot %s is not created by Revolver, skipping', ss.SnapshotIdentifier);
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
              `arn:aws:redshift:${this.accountConfig.region}:${this.Id}:snapshot:${xs.ClusterIdentifier}/${xs.SnapshotIdentifier}`,
            ),
        ),
      )
      .then((r) =>
        Promise.all(
          r.map(function (xs) {
            return redshift
              .describeTags({ ResourceName: xs.resourceArn })
              .promise()
              .then((t) => {
                xs.tags = t.TaggedResources!.map((xt) => xt.Tag).filter((xt) => xt) as Redshift.Tag[];
              })
              .then(() => xs);
          }),
        ),
      );

    return redshiftClusterSnapshots;
  }
}

export default RedshiftClusterSnapshotDriver;
