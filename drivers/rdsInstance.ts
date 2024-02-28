import { DateTime } from 'luxon';
import {
  DescribeDBInstancesCommand,
  ListTagsForResourceCommand,
  RDSClient,
  StartDBInstanceCommand,
  StopDBInstanceCommand,
  Tag,
} from '@aws-sdk/client-rds';
import { InstrumentedResource, ToolingInterface } from './instrumentedResource';
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
  get resourceTags(): { [key: string]: string } {
    return this.resource.TagList.reduce((a: any, n: any) => Object.assign(a, { [n.Key]: n.Value }), {});
  }
}

class RdsInstanceDriver extends DriverInterface {
  start(resources: InstrumentedRdsInstance[]) {
    const logger = this.logger;
    return getAwsClientForAccount(RDSClient, this.accountConfig).then(function (rds) {
      return Promise.all(
        resources.map(function (xr) {
          logger.info(`RDS instance ${xr.resourceId} will start`);
          return rds.send(new StartDBInstanceCommand({ DBInstanceIdentifier: xr.resourceId })).catch(function (err) {
            logger.error(`Error starting RDS instance ${xr.resourceId}, stack trace will follow`, err);
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
    return getAwsClientForAccount(RDSClient, this.accountConfig).then(function (rds) {
      return Promise.all(
        resources.map(function (xr) {
          if (xr.resource.DBInstanceStatus !== 'available') {
            logger.info(`RDS instance xr.resourceId can't be stopped, status [${xr.resource.DBInstanceStatus}]`);
            return Promise.resolve();
          }
          logger.info(`RDS instance ${xr.resourceId} will stop`);
          return rds.send(new StopDBInstanceCommand({ DBInstanceIdentifier: xr.resourceId })).catch(function (err) {
            logger.error(`Error stopping RDS instance ${xr.resourceId}, stack trace will follow`, err);
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
    this.logger.info(`RDS instances ${resources.map((xr) => xr.resourceId)} will noop because: ${action.reason}`);
    return Promise.resolve();
  }

  async setTag(resources: InstrumentedRdsInstance[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsInstance, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsInstance[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsInstance, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  collect() {
    const logger = this.logger;
    logger.debug(`RDS module collecting account: this.accountConfig.name`);
    return getAwsClientForAccount(RDSClient, this.accountConfig)
      .then((rds) => rds.send(new DescribeDBInstancesCommand({})))
      .then((r) => r.DBInstances!.map((xr) => new InstrumentedRdsInstance(xr)))
      .then((r) => Promise.all([Promise.resolve(r), getAwsClientForAccount(RDSClient, this.accountConfig)]))
      .then(([r, rds]) =>
        Promise.all(
          r.map(function (xr) {
            return rds
              .send(new ListTagsForResourceCommand({ ResourceName: xr.resourceArn }))
              .then((t) => {
                xr.tags = t.TagList || [];
              })
              .then(() => xr);
          }),
        ),
      );
  }
  resource(obj: InstrumentedResource): ToolingInterface {
    return new InstrumentedRdsInstance(obj.resource);
  }
}

export default RdsInstanceDriver;
