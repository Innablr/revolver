import { DateTime } from 'luxon';
import { RDS } from 'aws-sdk';
import assume from '../lib/assume';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { rdsTagger } from './tags';
import dateTime from '../lib/dateTime';

class InstrumentedRdsMultiAz extends ToolingInterface {
  public tags: RDS.Tag[] = [];

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
    return DateTime.fromISO(this.resource.InstanceCreateTime).setZone('UTC');
  }

  get isAvailable() {
    return this.resource.DBInstanceStatus === 'available';
  }

  tag(key: string) {
    const tag = this.tags.find((xt) => xt.Key === key);
    return tag?.Value;
  }
}

class RdsMultiAzDriver extends DriverInterface {
  start() {
    this.logger.debug("A multi-az RDS instance can't be started directly, ignoring");
    return Promise.resolve();
  }

  stopOneInstance(instance: InstrumentedRdsMultiAz) {
    let rds: RDS;
    const logger = this.logger;
    const tzTagName = this.accountConfig.timezone_tag || 'Timezone';
    const tz = instance.tag(tzTagName) || this.accountConfig.timezone || 'utc';
    const locaTimeNow = dateTime.getTime(tz);
    const snapshotId = `revolver-multiaz-${instance.resourceId}-${locaTimeNow.toFormat('yyyyLLddHHmmss')}`;
    const snapshotArn = `arn:aws:rds:${this.accountConfig.region}:${assume.accountId(this.accountConfig.assumeRoleArn)}:snapshot:${snapshotId}`;
    const preserveTags = instance.tags.concat([
      { Key: 'revolver/db_subnet_group_name', Value: instance.resource.DBSubnetGroup.DBSubnetGroupName },
      {
        Key: 'revolver/db_security_groups',
        Value: instance.resource.VpcSecurityGroups.map((xr: any) => xr.VpcSecurityGroupId).join('/'),
      },
    ]);

    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new RDS({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        rds = r;
      })
      .then(function () {
        logger.info('RDS instance %s will now be deleted with snapshot %s', instance.resourceId, snapshotId);
        return rds
          .deleteDBInstance({
            DBInstanceIdentifier: instance.resourceId,
            FinalDBSnapshotIdentifier: snapshotId,
            SkipFinalSnapshot: false,
          })
          .promise();
      })
      .then(function () {
        logger.debug('Saving instance %s tags in snapshot %s', instance.resourceId, snapshotId);
        return rds
          .addTagsToResource({
            ResourceName: snapshotArn,
            Tags: preserveTags,
          })
          .promise();
      })
      .catch(function (err) {
        logger.error('Error stopping RDS instance %s, stack trace will follow:', instance.resourceId);
        logger.error(err);
      });
  }

  stop(resources: InstrumentedRdsMultiAz[]) {
    return Promise.all(resources.map((xr) => this.stopOneInstance(xr)));
  }

  maskstop(resource: InstrumentedRdsMultiAz) {
    if (!resource.isAvailable) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is already in status ${resource.resource.DBInstanceStatus}`;
    }
    if (resource.resource.DBClusterIdentifier) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is part of cluster ${resource.resource.DBClusterIdentifier}`;
    }
    if (resource.resource.ReadReplicaSourceDBInstanceIdentifier) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is a read replica of ${resource.resource.ReadReplicaSourceDBInstanceIdentifier}`;
    }
    if (
      resource.resource.ReadReplicaDBInstanceIdentifiers &&
      resource.resource.ReadReplicaDBInstanceIdentifiers.length
    ) {
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
    return undefined;
  }

  noop(resources: InstrumentedRdsMultiAz[], action: RevolverAction) {
    this.logger.info(
      'RDS instances %j will noop because: %s',
      resources.map((xr) => xr.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  async setTag(resources: InstrumentedRdsMultiAz[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });

    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsMultiAz, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsMultiAz[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });

    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsMultiAz, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  collect() {
    let rds: RDS;
    const logger = this.logger;
    logger.debug('RDS MultiAZ module collecting account: %j', this.accountConfig.name);
    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new RDS({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        rds = r;
      })
      .then(() => rds.describeDBInstances({}).promise())
      .then(function (r) {
        const dbInstances = r.DBInstances!.filter(function (xi) {
          if (xi.MultiAZ !== true) {
            logger.info('RDS instance %s is not multi-az, skipping', xi.DBInstanceIdentifier);
            return false;
          }
          return true;
        });
        logger.debug('Found %d non-clustered multi-az RDS instances', dbInstances.length);
        return dbInstances;
      })
      .then((r) => r.map((xr) => new InstrumentedRdsMultiAz(xr)))
      .then((r) =>
        Promise.all(
          r.map(function (xr) {
            return rds
              .listTagsForResource({ ResourceName: xr.resourceArn })
              .promise()
              .then((t) => {
                xr.tags = t.TagList || [];
              })
              .then(() => xr);
          }),
        ),
      );
  }
}

export default RdsMultiAzDriver;
