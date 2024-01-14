import { EC2 } from 'aws-sdk';
import assume from '../lib/assume';
import { utc } from 'moment-timezone';
import { paginateAwsCall } from '../lib/common';
import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';

class InstrumentedEBS extends ToolingInterface {
  get resourceId() {
    return this.resource.VolumeId;
  }

  get resourceType() {
    return 'ebs';
  }

  get launchTimeUtc() {
    return utc(this.resource.CreateTime);
  }

  tag(key) {
    const tag = this.resource.Tags.find((xt) => xt.Key === key);
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

  maskstop(resource) {
    return `EBS volume ${resource.resourceId} can't be stopped`;
  }

  start() {
    this.logger.debug("An EBS volume can't be started directly, ignoring action");
    return Promise.resolve();
  }

  maskstart(resource) {
    return `EBS volume ${resource.resourceId} can't be started`;
  }

  async setTag(resources, action) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const ec2 = new AWS.EC2({ credentials: creds, region: this.accountConfig.region });

    return ec2Tagger.setTag(ec2, this.logger, resources, action);
  }

  masksetTag(resource, action) {
    return ec2Tagger.maskunsetTag(resource, action);
  }

  async unsetTag(resources, action) {
    const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
    const ec2 = new AWS.EC2({ credentials: creds, region: this.accountConfig.region });

    return ec2Tagger.unsetTag(ec2, this.logger, resources, action);
  }

  maskunsetTag(resource, action) {
    return ec2Tagger.maskunsetTag(resource, action);
  }

  noop(resources, action) {
    this.logger.info(
      'EBS volumes %j will noop because: %s',
      resources.map((xr) => xr.resourceId),
      action.reason,
    );
    return Promise.resolve();
  }

  async collect() {
    const logger = this.logger;
    const that = this;
    logger.debug('EBS module collecting account: %j', that.accountConfig.name);

    const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);
    const ec2 = await new AWS.EC2({ credentials: creds, region: this.accountConfig.region });

    const ebsVolumes = await ec2
      .describeVolumes({})
      .promise()
      .then((r) => r.Volumes);
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

    return ebsVolumes.map((xe) => new InstrumentedEBS(xe));
  }
}

module.exports = EBSDriver;
