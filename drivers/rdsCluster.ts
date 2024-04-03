import { DateTime } from 'luxon';
import {
  DescribeDBClustersCommand,
  DescribeDBInstancesCommand,
  RDSClient,
  StartDBClusterCommand,
  StopDBClusterCommand,
  Tag,
} from '@aws-sdk/client-rds';
import { InstrumentedResource, ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { rdsTagger } from './tags';
import { getAwsClientForAccount } from '../lib/awsConfig';
import { makeResourceTags } from '../lib/common';

class InstrumentedRdsCluster extends ToolingInterface {

  constructor(awsResource: any) {
    super(awsResource);
    this.metadata.members = awsResource.DBClusterMembers;
  }

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
  get resourceTags(): { [key: string]: string } {
    return makeResourceTags(this.resource.TagList);
  }
}

class RdsClusterDriver extends DriverInterface {
  async start(resources: InstrumentedRdsCluster[]) {
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    return Promise.all(
      resources.map((xr) => {
        this.logger.info(`RDS cluster ${xr.resourceId} will start`);
        return rds.send(new StartDBClusterCommand({ DBClusterIdentifier: xr.resourceId })).catch((err) => {
          this.logger.error(`Error starting RDS instance ${xr.resourceId}, stack trace will follow`, err);
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
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    return Promise.all(
      resources.map((xr) => {
        this.logger.info(`RDS cluster ${xr.resourceId} will stop`);
        return rds.send(new StopDBClusterCommand({ DBClusterIdentifier: xr.resourceId })).catch((err) => {
          this.logger.error(`Error stopping RDS instance ${xr.resourceId}, stack trace will follow`, err);
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
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsCluster, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsCluster[], action: RevolverActionWithTags) {
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsCluster, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  async collect() {
    const logger = this.logger;
    logger.debug(`RDS Cluster module collecting account: ${this.accountConfig.name}`);
    const rds = await getAwsClientForAccount(RDSClient, this.accountConfig);
    const clusters = await rds.send(new DescribeDBClustersCommand({}));
    const instances = await rds.send(new DescribeDBInstancesCommand({}));

    const instrumentedClusters = clusters
      .DBClusters!.map((xc) => new InstrumentedRdsCluster(xc))
      .map(function (xc) {
        xc.resource.DBClusterMembers.forEach((xm: any) => {
          xm.instanceData = instances.DBInstances!.find((xi) => xi.DBInstanceIdentifier === xm.DBInstanceIdentifier);
        });
        return xc;
      });

    logger.info(`Found ${instrumentedClusters.length} RDS clusters`);
    return instrumentedClusters;
  }
  resource(obj: InstrumentedResource): ToolingInterface {
    return new InstrumentedRdsCluster(obj.resource);
  }
}

export default RdsClusterDriver;
