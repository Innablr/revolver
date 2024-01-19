import { DateTime } from 'luxon';
import { RDS, Tag } from '@aws-sdk/client-rds';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { rdsTagger } from './tags';
import { getAwsClientForAccount } from '../lib/awsConfig';

class InstrumentedRdsCluster extends ToolingInterface {
  get resourceId() {
    return this.resource.DBClusterIdentifier;
  }

  get resourceArn() {
    return this.resource.DBClusterArn;
  }

  get resourceType() {
    return 'rdsCluster';
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.ClusterCreateTime).setZone('UTC');
  }

  get resourceState() {
    if (this.isAvailable) {
      return 'running';
    }
    return 'stopped';
  }

  get isAvailable() {
    return (
      this.resource.Status === 'available' &&
      this.resource.DBClusterMembers.every((xm: any) => xm.instanceData.DBInstanceStatus === 'available')
    );
  }

  get isStopped() {
    return (
      this.resource.Status === 'stopped' &&
      this.resource.DBClusterMembers.every((xm: any) => xm.instanceData.DBInstanceStatus === 'stopped')
    );
  }

  tag(key: string) {
    const tag = this.resource.TagList.find((xt: Tag) => xt.Key === key);
    return tag?.Value;
  }
}

class RdsClusterDriver extends DriverInterface {
  async start(resources: InstrumentedRdsCluster[]) {
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    return Promise.all(
      resources.map((xr) => {
        this.logger.info('RDS cluster %s will start', xr.resourceId);
        return rds.startDBCluster({ DBClusterIdentifier: xr.resourceId }).catch((err) => {
          this.logger.error('Error starting RDS instance %s, stack trace will follow:', xr.resourceId);
          this.logger.error(err);
        });
      }),
    );
  }

  maskstart(resource: InstrumentedRdsCluster) {
    if (!resource.isStopped) {
      return `Cluster ${resource.resourceId} or one of its instances is not in stopped state`;
    }
    return undefined;
  }

  async stop(resources: InstrumentedRdsCluster[]) {
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    return Promise.all(
      resources.map((xr) => {
        this.logger.info('RDS cluster %s will stop', xr.resourceId);
        return rds.stopDBCluster({ DBClusterIdentifier: xr.resourceId }).catch((err) => {
          this.logger.error('Error stopping RDS instance %s, stack trace will follow:', xr.resourceId);
          this.logger.error(err);
        });
      }),
    );
  }

  maskstop(resource: InstrumentedRdsCluster) {
    if (!resource.isAvailable) {
      return `Cluster ${resource.resourceId} or one of its instances is not in available state`;
    }
    return undefined;
  }

  noop(resources: InstrumentedRdsCluster[], action: RevolverAction) {
    this.logger.info(`RDS clusters ${resources.map((xr) => xr.resourceId)} will noop because: ${action.reason}`);
    return Promise.resolve();
  }

  async setTag(resources: InstrumentedRdsCluster[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsCluster, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsCluster[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsCluster, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  async collect() {
    const logger = this.logger;
    logger.debug('RDS Cluster module collecting account: %j', this.accountConfig.name);
    const rds = await getAwsClientForAccount(RDS, this.accountConfig);
    const clusters = await rds.describeDBClusters({});
    const instances = await rds.describeDBInstances({});

    const instrumentedClusters = clusters
      .DBClusters!.map((xc) => new InstrumentedRdsCluster(xc))
      .map(function (xc) {
        xc.resource.DBClusterMembers.forEach((xm: any) => {
          xm.instanceData = instances.DBInstances!.find((xi) => xi.DBInstanceIdentifier === xm.DBInstanceIdentifier);
        });
        return xc;
      });

    logger.info('Found %d RDS clusters', instrumentedClusters.length);
    return instrumentedClusters;
  }
}

export default RdsClusterDriver;
