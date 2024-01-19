import { CreateVolumeCommandOutput, EC2, Tag } from '@aws-sdk/client-ec2';
import { DateTime } from 'luxon';
import { paginateAwsCall } from '../lib/common';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { ec2Tagger } from './tags';
import { getAwsClientForAccount } from '../lib/awsConfig';

class InstrumentedEBS extends ToolingInterface {
  private volumeARN: string;

  constructor(resource: CreateVolumeCommandOutput, volumeARN: string) {
    super(resource);
    this.volumeARN = volumeARN;
  }

  get resourceId() {
    return this.resource.VolumeId;
  }

  get resourceType() {
    return 'ebs';
  }

  get resourceArn() {
    return this.volumeARN;
  }

  get resourceState() {
    return this.resource.State;
  }

  get launchTimeUtc() {
    return DateTime.fromISO(this.resource.LaunchTime).setZone('utc');
  }

  tag(key: string) {
    const tag = this.resource.Tags.find((xt: Tag) => xt.Key === key);
    if (tag !== undefined) {
      return tag.Value;
    }
  }
}

class EBSDriver extends DriverInterface {
  stop() {
    this.logger.debug("An EBS volume can't be stopped directly, ignoring action");
    return Promise.resolve();
  }

  maskstop(resource: InstrumentedEBS) {
    return `EBS volume ${resource.resourceId} can't be stopped`;
  }

  start() {
    this.logger.debug("An EBS volume can't be started directly, ignoring action");
    return Promise.resolve();
  }

  maskstart(resource: InstrumentedEBS) {
    return `EBS volume ${resource.resourceId} can't be started`;
  }

  async setTag(resources: InstrumentedEBS[], action: RevolverActionWithTags) {
    const ec2 = await getAwsClientForAccount(EC2, this.accountConfig);
    return ec2Tagger.setTag(ec2, this.logger, resources, action);
  }

  masksetTag(resource: InstrumentedEBS, action: RevolverActionWithTags) {
    return ec2Tagger.masksetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedEBS[], action: RevolverActionWithTags) {
    const ec2 = await getAwsClientForAccount(EC2, this.accountConfig);
    return ec2Tagger.unsetTag(ec2, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedEBS, action: RevolverActionWithTags) {
    return ec2Tagger.maskunsetTag(resource, action);
  }

  noop(resources: InstrumentedEBS[], action: RevolverAction) {
    this.logger.info(
      'EBS volumes %j will noop because: %s',
      resources.map((xr) => xr.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  async collect() {
    const logger = this.logger;
    logger.debug('EBS module collecting account: %j', this.accountConfig.name);

    const ec2 = await getAwsClientForAccount(EC2, this.accountConfig);

    const ebsVolumes = await paginateAwsCall(ec2.describeVolumes.bind(ec2), 'Volumes');
    const ec2instances = (await paginateAwsCall(ec2.describeInstances.bind(ec2), 'Reservations')).flatMap(
      (xr) => xr.Instances,
    );

    logger.debug('Found %d ebs volumes', ebsVolumes.length);

    for (const volume of ebsVolumes) {
      if (volume.State === 'in-use') {
        const instanceId = volume.Attachments[0].InstanceId;
        volume.instanceDetails = ec2instances.find((xi) => xi.InstanceId === instanceId);
      }
    }

    return ebsVolumes.map(
      (xe) =>
        new InstrumentedEBS(xe, `arn:aws:ec2:${this.accountConfig.region}:${this.accountId}:volume/${xe.VolumeId}`),
    );
  }
}

export default EBSDriver;
