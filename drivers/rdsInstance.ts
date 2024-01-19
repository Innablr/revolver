import { DateTime } from 'luxon';
import { RDS, Tag } from '@aws-sdk/client-rds';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { rdsTagger } from './tags';
import { getAwsClientForAccount } from '../lib/awsConfig';

class InstrumentedRdsInstance extends ToolingInterface {
  public tags: Tag[] = [];

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
    if (this.isStopped) {
      return 'stopped';
    }
    return this.resource.DBInstanceStatus;
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.InstanceCreateTime).setZone('UTC');
  }

  get isAvailable() {
    return this.resource.DBInstanceStatus === 'available';
  }

  get isStopped() {
    return this.resource.DBInstanceStatus === 'stopped';
  }

  tag(key: string) {
    const tag = this.tags.find((xt) => xt.Key === key);
    return tag?.Value;
  }
}

class RdsInstanceDriver extends DriverInterface {
  start(resources: InstrumentedRdsInstance[]) {
    const logger = this.logger;
    return getAwsClientForAccount(RDS, this.accountConfig)
      .then(function (rds) {
        return Promise.all(
          resources.map(function (xr) {
            logger.info('RDS instance %s will start', xr.resourceId);
            return rds
              .startDBInstance({ DBInstanceIdentifier: xr.resourceId })
              .catch(function (err) {
                logger.error('Error starting RDS instance %s, stack trace will follow:', xr.resourceId);
                logger.error(err);
              });
          }),
        );
      });
  }

  maskstart(resource: InstrumentedRdsInstance) {
    if (resource.resource.DBClusterIdentifier) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is part of cluster ${resource.resource.DBClusterIdentifier}`;
    }
    if (resource.resource.ReadReplicaSourceDBInstanceIdentifier) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is a read replica of ${resource.resource.ReadReplicaSourceDBInstanceIdentifier}`;
    }
    if (
      resource.resource.ReadReplicaDBInstanceIdentifiers !== undefined &&
      resource.resource.ReadReplicaDBInstanceIdentifiers.length
    ) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replicas`;
    }
    if (
      resource.resource.ReadReplicaDBClusterIdentifiers !== undefined &&
      resource.resource.ReadReplicaDBClusterIdentifiers.length
    ) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replica clusters`;
    }
    if (!resource.isStopped) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is already in status ${resource.resourceState}`;
    }
    return undefined;
  }

  stop(resources: InstrumentedRdsInstance[]) {
    const logger = this.logger;
    return getAwsClientForAccount(RDS, this.accountConfig).then(function (rds) {
      return Promise.all(
        resources.map(function (xr) {
          if (xr.resource.DBInstanceStatus !== 'available') {
            logger.info("RDS instance %s can't be stopped, status [%s]", xr.resourceId, xr.resource.DBInstanceStatus);
            return Promise.resolve();
          }
          logger.info('RDS instance %s will stop', xr.resourceId);
          return rds.stopDBInstance({ DBInstanceIdentifier: xr.resourceId }).catch(function (err) {
            logger.error('Error stopping RDS instance %s, stack trace will follow:', xr.resourceId);
            logger.error(err);
          });
        }),
      );
    });
  }

  maskstop(resource: InstrumentedRdsInstance) {
    if (resource.resource.DBClusterIdentifier) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is part of cluster ${resource.resource.DBClusterIdentifier}`;
    }
    if (resource.resource.ReadReplicaSourceDBInstanceIdentifier) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is a read replica of ${resource.resource.ReadReplicaSourceDBInstanceIdentifier}`;
    }
    if (
      resource.resource.ReadReplicaDBInstanceIdentifiers !== undefined &&
      resource.resource.ReadReplicaDBInstanceIdentifiers.length
    ) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replicas`;
    }
    if (
      resource.resource.ReadReplicaDBClusterIdentifiers !== undefined &&
      resource.resource.ReadReplicaDBClusterIdentifiers.length
    ) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} has read replica clusters`;
    }
    if (!resource.isAvailable) {
      return `RDS instance ${resource.resource.DBInstanceIdentifier} is already in status ${resource.resourceState}`;
    }
    return undefined;
  }

  noop(resources: InstrumentedRdsInstance[], action: RevolverAction) {
    this.logger.info(
      'RDS instances %j will noop because: %s',
      resources.map((xr) => xr.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  async setTag(resources: InstrumentedRdsInstance[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsInstance, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsInstance[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsInstance, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  collect() {
    const logger = this.logger;
    logger.debug('RDS module collecting account: %j', this.accountConfig.name);
    return getAwsClientForAccount(RDS, this.accountConfig)
      .then((rds) => rds.describeDBInstances({}))
      .then((r) => r.DBInstances!.map((xr) => new InstrumentedRdsInstance(xr)))
      .then((r) => Promise.all([Promise.resolve(r), getAwsClientForAccount(RDS, this.accountConfig)]))
      .then(([r, rds]) =>
        Promise.all(
          r.map(function (xr) {
            return rds
              .listTagsForResource({ ResourceName: xr.resourceArn })
              .then((t) => {
                xr.tags = t.TagList || [];
              })
              .then(() => xr);
          }),
        ),
      );
  }
}

export default RdsInstanceDriver;
