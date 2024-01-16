import { DateTime } from 'luxon';
import { RDS } from 'aws-sdk';
import assume from '../lib/assume';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { rdsTagger } from './tags';
import dateTime from '../lib/dateTime';

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

  get instances() {
    return this.resource.DBClusterMembers;
  }

  get writerInstance() {
    return this.instances.find((xm: any) => xm.IsClusterWriter);
  }

  get writerInstanceArn() {
    return this.writerInstance.instanceData.DBInstanceArn;
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
      this.instances.every((xi: any) => xi.instanceData.DBInstanceStatus === 'available')
    );
  }

  tag(key: string) {
    const tag: RDS.Tag = this.writerInstance.tags.find((xt: RDS.Tag) => xt.Key === key);
    return tag?.Value;
  }
}

class RdsClusterDriver extends DriverInterface {
  start() {
    this.logger.debug("An RDS cluster can't be started directly, ignoring");
    return Promise.resolve();
  }

  stopOneCluster(cluster: InstrumentedRdsCluster) {
    let rds: RDS;
    const logger = this.logger;
    const tzTagName = this.accountConfig.timezone_tag || 'Timezone';
    const tz = cluster.tag(tzTagName) || this.accountConfig.timezone || 'utc';
    const locaTimeNow = dateTime.getTime(tz);
    const snapshotId = `revolver-cluster-${cluster.resourceId}-${locaTimeNow.toFormat('yyyyLLddHHmmss')}`;
    const snapshotArn = `arn:aws:rds:${this.accountConfig.region}:${assume.accountId(this.accountConfig.assumeRoleArn)}:cluster-snapshot:${snapshotId}`;
    const preserveTags = cluster.writerInstance.tags
      .concat([
        { Key: 'revolver/db_subnet_group_name', Value: cluster.resource.DBSubnetGroup.DBSubnetGroupName },
        {
          Key: 'revolver/db_security_groups',
          Value: cluster.resource.VpcSecurityGroups.map((xr: any) => xr.VpcSecurityGroupId).join('/'),
        },
        { Key: 'revolver/cluster_port', Value: cluster.resource.Port.toString() },
        { Key: 'revolver/db_name', Value: cluster.resource.DatabaseName },
      ])
      .concat(
        cluster.instances.map((xs: any) => ({
          Key: `revolver/instance/${xs.instanceData.DBInstanceIdentifier}`,
          Value: `${xs.instanceData.AvailabilityZone}/${xs.instanceData.DBInstanceClass}`,
        })),
      );

    return assume
      .connectTo(this.accountConfig.assumeRoleArn)
      .then((creds) => new RDS({ credentials: creds, region: this.accountConfig.region }))
      .then((r) => {
        rds = r;
      })
      .then(function () {
        logger.info('All instances in RDS cluster %s will now be deleted', cluster.resourceId);
        return Promise.all(
          cluster.instances.map((xi: any) =>
            rds
              .deleteDBInstance({
                DBInstanceIdentifier: xi.DBInstanceIdentifier,
                SkipFinalSnapshot: true,
              })
              .promise(),
          ),
        );
      })
      .then(function () {
        logger.info('RDS cluster %s will now be deleted with snapshot %s', cluster.resourceId, snapshotId);
        return rds
          .deleteDBCluster({
            DBClusterIdentifier: cluster.resourceId,
            FinalDBSnapshotIdentifier: snapshotId,
            SkipFinalSnapshot: false,
          })
          .promise();
      })
      .then(function () {
        logger.debug('Saving cluster %s tags in snapshot %s', cluster.resourceId, snapshotId);
        return rds
          .addTagsToResource({
            ResourceName: snapshotArn,
            Tags: preserveTags,
          })
          .promise();
      })
      .catch(function (err) {
        logger.error('Error stopping RDS cluster %s, stack trace will follow:', cluster.resourceId);
        logger.error(err);
      });
  }

  stop(resources: InstrumentedRdsCluster[]) {
    return Promise.all(resources.map((xr) => this.stopOneCluster(xr)));
  }

  maskstop(resource: InstrumentedRdsCluster) {
    if (!resource.isAvailable) {
      return `Cluster ${resource.resourceId} or one of its instances is not in available state`;
    }
    return undefined;
  }

  noop(resources: InstrumentedRdsCluster[], action: RevolverAction) {
    this.logger.info(
      'RDS clusters %j will noop because: %s',
      resources.map((xr) => xr.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  async setTag(resources: InstrumentedRdsCluster[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });

    return rdsTagger.setTag(rds, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedRdsCluster, action: RevolverActionWithTags) {
    return rdsTagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedRdsCluster[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });

    return rdsTagger.unsetTag(rds, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedRdsCluster, action: RevolverActionWithTags) {
    return rdsTagger.maskunsetTag(resource, action);
  }

  async collect() {
    const logger = this.logger;
    logger.debug('RDS Cluster module collecting account: %j', this.accountConfig.name);
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const rds = new RDS({ credentials: creds, region: this.accountConfig.region });
    const clusters = await rds.describeDBClusters({}).promise();
    const instances = await rds.describeDBInstances({}).promise();

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
