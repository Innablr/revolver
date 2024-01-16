import { DateTime } from 'luxon';
import { RDS } from 'aws-sdk';
import assume from '../lib/assume';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { rdsTagger } from './tags';

class InstrumentedRdsClusterSnapshot extends ToolingInterface {
  public tags: RDS.Tag[] = [];

  get resourceId() {
    return this.resource.DBClusterSnapshotIdentifier;
  }

  get resourceArn() {
    return this.resource.DBClusterSnapshotArn;
  }

  get resourceType() {
    return 'rdsClusterSnapshot';
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.SnapshotCreateTime).setZone('UTC');
  }

  get resourceState() {
    return 'stopped';
  }

  tag(key: string) {
    const tag = this.tags.find((xt) => xt.Key === key);
    return tag?.Value;
  }
}

class RdsClusterSnapshotDriver extends DriverInterface {
  restoreRdsSg(resources: InstrumentedRdsClusterSnapshot[]) {
    const logger = this.logger;
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new RDS({ credentials: creds, region: this.accountConfig.region }))
      .then(function (rds) {
        return Promise.all(
          resources.map(function (xs) {
            const sg = xs.tag('revolver/db_security_groups');
            if (sg === undefined) {
              return Promise.resolve();
            }
            logger.info('Restoring security groups %s on instance %s', sg, xs.resource.DBInstanceIdentifier);
            return rds
              .modifyDBInstance({
                DBInstanceIdentifier: xs.resource.DBInstanceIdentifier,
                VpcSecurityGroupIds: sg.split('/'),
              })
              .promise()
              .then(function () {
                logger.info('Deleting snapshot %s', xs.resource.DBSnapshotIdentifier);
                return rds.deleteDBSnapshot({ DBSnapshotIdentifier: xs.resource.DBSnapshotIdentifier }).promise();
              })
              .catch(function (err) {
                logger.error(
                  'Error restoring security groups on instance %s, stack trace will follow:',
                  xs.resource.DBInstanceIdentifier,
                );
                logger.error(err);
              });
          }),
        );
      });
  }

  startOneSnapshot(snapshot: InstrumentedRdsClusterSnapshot) {
    let rds: RDS;
    const logger = this.logger;
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new RDS({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        rds = r;
      })
      .then(function () {
        logger.info(
          'RDS Cluster %s will now be restored from snapshot %s',
          snapshot.resource.DBClusterIdentifier,
          snapshot.resourceId,
        );
        const sgTag = snapshot.tag('revolver/db_security_groups');
        const opts = {
          DBClusterIdentifier: snapshot.resource.DBClusterIdentifier,
          SnapshotIdentifier: snapshot.resourceId,
          Engine: snapshot.resource.Engine,
          AvailabilityZones: snapshot.resource.AvailabilityZones,
          DBSubnetGroupName: snapshot.tag('revolver/db_subnet_group_name'),
          DatabaseName: snapshot.tag('revolver/db_name'),
          EnableIAMDatabaseAuthentication: snapshot.resource.IAMDatabaseAuthenticationEnabled,
          EngineVersion: snapshot.resource.EngineVersion,
          Port: parseInt(snapshot.tag('revolver/cluster_port') || '0', 10),
          VpcSecurityGroupIds: [] as string[],
        };
        if (sgTag !== undefined) {
          opts.VpcSecurityGroupIds = sgTag.split('/');
        }
        return rds.restoreDBClusterFromSnapshot(opts).promise();
      })
      .then(function () {
        return Promise.all(
          snapshot.tags
            .filter((xt: RDS.Tag) => xt.Key?.startsWith('revolver/instance'))
            .map(function (xt) {
              const [, , instanceId] = xt.Key!.split('/');
              const [instanceAz, instanceClass] = xt.Value!.split('/');

              return {
                DBInstanceClass: instanceClass,
                DBInstanceIdentifier: instanceId,
                Engine: snapshot.resource.Engine,
                AvailabilityZone: instanceAz,
                DBClusterIdentifier: snapshot.resource.DBClusterIdentifier,
                DBSubnetGroupName: snapshot.tag('revolver/db_subnet_group_name'),
                EngineVersion: snapshot.resource.EngineVersion,
                Tags: snapshot.tags.filter((xxt) => !xxt.Key?.startsWith('revolver/')),
              };
            })
            .map(function (xo) {
              logger.info(
                'Adding RDS instance %s to cluster %s',
                xo.DBInstanceIdentifier,
                snapshot.resource.DBClusterIdentifier,
              );
              return rds.createDBInstance(xo).promise();
            }),
        );
      })
      .then(function () {
        logger.info('Erasing RDS snapshot %s', snapshot.resourceId);
        return rds
          .deleteDBClusterSnapshot({
            DBClusterSnapshotIdentifier: snapshot.resourceId,
          })
          .promise();
      })
      .catch(function (err) {
        logger.error('Error restoring RDS snapshot %s, stack trace will follow:', snapshot.resourceId);
        logger.error(err);
      });
  }

  start(resources: InstrumentedRdsClusterSnapshot[]) {
    return Promise.all(resources.map((xs) => this.startOneSnapshot(xs)));
  }

  maskstart(resource: InstrumentedRdsClusterSnapshot) {
    if (resource.tag('revolver/restore_commenced') !== undefined) {
      return `RDS snapshot ${resource.resource.resourceId} already started restoring at ${resource.tag('revolver/restore_commenced')}`;
    }
    return undefined;
  }

  stop() {
    this.logger.debug("An RDS Cluster snapshot can't be stopped directly, ignoring action");
    return Promise.resolve();
  }

  maskstop(resource: InstrumentedRdsClusterSnapshot) {
    return `RDS Cluster snapshot ${resource.resourceId} can't be stopped`;
  }

  noop(resources: InstrumentedRdsClusterSnapshot[], action: RevolverAction) {
    this.logger.info(
      'RDS snapshots %j will noop because: %s',
      resources.map((xs) => xs.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  async setTag(resources: InstrumentedRdsClusterSnapshot[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });

    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsClusterSnapshot, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsClusterSnapshot[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });

    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsClusterSnapshot, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  collect() {
    let rds: RDS;
    const logger = this.logger;
    logger.debug('RDS Cluster Snapshot module collecting account: %j', this.accountConfig.name);
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new RDS({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        rds = r;
      })
      .then(() => rds.describeDBClusterSnapshots({}).promise())
      .then(function (r) {
        const clusterSnapshots = r
          .DBClusterSnapshots!.filter(function (xs) {
            if (!/^revolver-cluster-/.test(xs.DBClusterSnapshotIdentifier || '')) {
              logger.info('RDS snapshot %s is not created by Revolver, skipping', xs.DBClusterSnapshotIdentifier);
              return false;
            }
            return true;
          })
          .filter(function (xs) {
            if (xs.Status !== 'available') {
              logger.info('RDS snapshot %s has status %s, must be available, skipping');
              return false;
            }
            return true;
          });
        logger.info('Found %d RDS snapshots', clusterSnapshots.length);
        return clusterSnapshots;
      })
      .then((r) => r.map((xs) => new InstrumentedRdsClusterSnapshot(xs)))
      .then((r) =>
        Promise.all(
          r.map(function (xs) {
            return rds
              .listTagsForResource({ ResourceName: xs.resourceArn })
              .promise()
              .then((t) => {
                xs.tags = t.TagList || [];
              })
              .then(() => xs);
          }),
        ),
      );
  }
}

export default RdsClusterSnapshotDriver;
