import { DateTime } from 'luxon';
import { EC2 } from 'aws-sdk';
import assume from '../lib/assume';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverActionWithTags } from '../actions/actions';
import { paginateAwsCall } from '../lib/common';
import { ec2Tagger } from './tags';

class InstrumentedSnapshot extends ToolingInterface {
  get resourceId() {
    return this.resource.SnapshotId;
  }

  get resourceType() {
    return 'snapshot';
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.StartTime).setZone('utc');
  }

  get resourceState() {
    return this.resource.State;
  }

  get resourceArn() {
    return 'notsupported';
  }

  tag(key: string) {
    const tag = this.resource.Tags.find((xt: EC2.Tag) => xt.Key === key);
    return tag?.Value;
  }
}

class SnapshotDriver extends DriverInterface {
  stop() {
    this.logger.debug("An EBS snapshot can't be stopped directly, ignoring action");
    return Promise.resolve();
  }

  maskstop(resource: InstrumentedSnapshot) {
    return `EBS snapshot ${resource.resourceId} can't be stopped`;
  }

  start() {
    this.logger.debug("An EBS snapshot can't be started directly, ignoring action");
    return Promise.resolve();
  }

  maskstart(resource: InstrumentedSnapshot) {
    return `EBS snapshot ${resource.resourceId} can't be started`;
  }

  async setTag(resources: InstrumentedSnapshot[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const ec2 = new EC2({ credentials: creds, region: this.accountConfig.region });

    return ec2Tagger.setTag(ec2, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedSnapshot, action: RevolverActionWithTags) {
    return ec2Tagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedSnapshot[], action: RevolverActionWithTags) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const ec2 = new EC2({ credentials: creds, region: this.accountConfig.region });

    return ec2Tagger.unsetTag(ec2, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedSnapshot, action: RevolverActionWithTags) {
    return ec2Tagger.maskunsetTag(resource, action);
  }

  async collect() {
    const logger = this.logger;
    logger.debug('Snapshot module collecting account: %j', this.accountConfig.name);

    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const ec2 = await new EC2({ credentials: creds, region: this.accountConfig.region });

    const snapshots = await paginateAwsCall(ec2.describeSnapshots.bind(ec2), 'Snapshots', {
      OwnerIds: [this.Id],
    });
    logger.debug('Snapshots %d found', snapshots.length);

    const volumes = await paginateAwsCall(ec2.describeVolumes.bind(ec2), 'Volumes');
    const instances = (await paginateAwsCall(ec2.describeInstances.bind(ec2), 'Reservations')).flatMap(
      (xr) => xr.Instances,
    );

    for (const snapshot of snapshots) {
      if (snapshot.State === 'completed') {
        snapshot.volumeDetails = volumes.find((xv) => xv.VolumeId === snapshot.VolumeId);
        if (snapshot.volumeDetails) {
          const volumeDetails = snapshot.volumeDetails;
          if (volumeDetails.State === 'in-use') {
            const instanceId = volumeDetails.Attachments[0].InstanceId;
            snapshot.instanceDetails = instances.find((xi) => xi.InstanceId === instanceId);
          }
        }
      }
    }

    return snapshots.map((snapshot) => new InstrumentedSnapshot(snapshot));
  }
}

export default SnapshotDriver;
