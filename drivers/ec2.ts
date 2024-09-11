import {
  AutoScalingClient,
  ResumeProcessesCommand,
  SuspendProcessesCommand,
  paginateDescribeAutoScalingGroups,
} from '@aws-sdk/client-auto-scaling';
import {
  EC2Client,
  type Instance,
  StartInstancesCommand,
  StopInstancesCommand,
  type Tag,
  paginateDescribeInstances,
} from '@aws-sdk/client-ec2';
import type { RevolverAction, RevolverActionWithTags } from '../actions/actions.js';
import { getAwsClientForAccount } from '../lib/awsConfig.js';
import { chunkArray, makeResourceTags, paginateAwsCall } from '../lib/common.js';
import dateTime from '../lib/dateTime.js';
import { DriverInterface } from './driverInterface.js';
import { type InstrumentedResource, ToolingInterface } from './instrumentedResource.js';
import { ec2Tagger } from './tags.js';

class InstrumentedEc2 extends ToolingInterface {
  private instanceARN: string;

  constructor(resource: Instance, instanceARN: string) {
    super(resource);
    this.instanceARN = instanceARN;
    if (this.resourceState === 'running') {
      this.metadata.uptime = dateTime.calculateUptime(this.launchTimeUtc).toFixed(2);
    }
  }

  get resourceId() {
    return this.resource.InstanceId;
  }

  get resourceType() {
    return 'ec2';
  }

  get resourceArn() {
    return this.instanceARN;
  }

  get launchTimeUtc() {
    // If a resource is stopped, this still contains the original launch time
    return dateTime.getUtcDateTime(this.resource.LaunchTime);
  }

  get resourceState() {
    switch (this.resource.State.Name) {
      case 'stopping':
      case 'stopped':
        return 'stopped';
      case 'pending':
      case 'running':
        return 'running';
      default:
        return 'other';
    }
  }

  tag(key: string) {
    const tag = (this.resource.Tags || []).find((xt: Tag) => xt.Key === key);
    if (tag !== undefined) {
      return tag.Value;
    }
  }

  get resourceTags(): { [key: string]: string } {
    return makeResourceTags(this.resource.Tags);
  }
}

class Ec2Driver extends DriverInterface {
  maskstart(resource: InstrumentedEc2) {
    if (resource.resourceState === 'running') {
      return `EC2 instance ${resource.resourceId} is in status ${resource.resourceState}`;
    }
    if (resource.resource.InstanceLifecycle === 'spot') {
      return `EC2 instance ${resource.resourceId} is a spot instance`;
    }
    return undefined;
  }

  async start(resources: InstrumentedEc2[]) {
    const logger = this.logger;
    const autoscaling = await getAwsClientForAccount(AutoScalingClient, this.accountConfig);
    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);

    const resourceChunks = chunkArray(resources, 200);
    const asgs = resources
      .map((xr) => xr.resource.AutoScalingGroupName)
      .filter((xa) => xa)
      .reduce((x, y) => (x.includes(y) ? x : [...x, y]), []);

    await Promise.all(
      resourceChunks.map(async function (chunk) {
        logger.info(`EC2 instances ${DriverInterface.toLimitedString(chunk)} will start`);
        return ec2.send(
          new StartInstancesCommand({
            InstanceIds: chunk.map((xr) => xr.resourceId),
          }),
        );
      }),
    );

    if (asgs.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await Promise.all(
        asgs.map(function (xa: string) {
          logger.info(`Resuming ASG ${xa}`);
          return autoscaling.send(new ResumeProcessesCommand({ AutoScalingGroupName: xa })).catch((e) => {
            logger.error(`Autoscaling group ${xa} failed to resume`, e);
          });
        }),
      );
    }

    return null;
  }

  maskstop(resource: InstrumentedEc2) {
    if (resource.resourceState === 'stopped') {
      return `EC2 instance ${resource.resourceId} is in status ${resource.resourceState}`;
    }
    if (resource.resource.InstanceLifecycle === 'spot') {
      return `EC2 instance ${resource.resourceId} is a spot instance`;
    }
    return undefined;
  }

  async stop(resources: InstrumentedEc2[]) {
    const logger = this.logger;
    const autoscaling = await getAwsClientForAccount(AutoScalingClient, this.accountConfig);
    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);

    const resourceChunks = chunkArray(resources, 200);
    const asgs = resources
      .map((xr) => xr.resource.AutoScalingGroupName)
      .filter((xa) => xa)
      .reduce((x, y) => (x.includes(y) ? x : [...x, y]), []);

    await Promise.all(
      asgs.map(function (xa: string) {
        logger.info(`Pausing ASG ${xa}`);
        return autoscaling.send(new SuspendProcessesCommand({ AutoScalingGroupName: xa })).catch((e) => {
          logger.error(`Autoscaling group ${xa} failed to resume`, e);
        });
      }),
    );

    await Promise.all(
      resourceChunks.map(async function (chunk) {
        logger.info(`EC2 instances ${DriverInterface.toLimitedString(chunk)} will stop`);
        return ec2.send(
          new StopInstancesCommand({
            InstanceIds: chunk.map((xr) => xr.resourceId),
          }),
        );
      }),
    );

    return null;
  }

  noop(resources: InstrumentedEc2[], action: RevolverAction) {
    this.logger.info(`EC2 instances ${DriverInterface.toLimitedString(resources)} will noop because: ${action.reason}`);
    return Promise.resolve();
  }

  masksetTag(resource: InstrumentedEc2, action: RevolverActionWithTags) {
    return ec2Tagger.masksetTag(resource, action);
  }

  async setTag(resources: InstrumentedEc2[], action: RevolverActionWithTags) {
    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);

    return ec2Tagger.setTag(ec2, this.logger, resources, action);
  }

  maskunsetTag(resource: InstrumentedEc2, action: RevolverActionWithTags) {
    return ec2Tagger.maskunsetTag(resource, action);
  }

  async unsetTag(resources: InstrumentedEc2[], action: RevolverActionWithTags) {
    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);

    return ec2Tagger.unsetTag(ec2, this.logger, resources, action);
  }

  async collect() {
    const logger = this.logger;
    const inoperableStates = ['terminated', 'shutting-down'];
    logger.debug(`EC2 module collecting account: ${this.accountConfig.name}`);

    const ec2 = await getAwsClientForAccount(EC2Client, this.accountConfig);
    const autoscaling = await getAwsClientForAccount(AutoScalingClient, this.accountConfig);

    const allEc2Iinstances = (await paginateAwsCall(paginateDescribeInstances, ec2, 'Reservations')).flatMap(
      (xr) => xr.Instances,
    );
    const ec2Instances = allEc2Iinstances.filter(function (xi) {
      if (inoperableStates.find((x) => x === xi.State.Name)) {
        logger.info(`EC2 instance ${xi.InstanceId} state ${xi.State.Name} is inoperable`);
        return false;
      }
      return true;
    });

    const autoscalingGroups = await paginateAwsCall(
      paginateDescribeAutoScalingGroups,
      autoscaling,
      'AutoScalingGroups',
    );

    for (const xi of ec2Instances) {
      const asg = autoscalingGroups.find(
        (xa) => xa.Instances.find((xai: Instance) => xai.InstanceId === xi.InstanceId) !== undefined,
      );
      xi.AutoScalingGroupName = asg ? asg.AutoScalingGroupName : undefined;
      if (xi.AutoScalingGroupName !== undefined) {
        logger.debug(`Instance ${xi.InstanceId} is member of ASG ${xi.AutoScalingGroupName}`);
      }
    }

    return ec2Instances.map(
      (xi) =>
        new InstrumentedEc2(xi, `arn:aws:ec2:${this.accountConfig.region}:${this.accountId}:instance/${xi.InstanceId}`),
    );
  }

  resource(obj: InstrumentedResource): ToolingInterface {
    const res = new InstrumentedEc2(obj.resource, obj.resourceArn);
    res.metadata.tags = makeResourceTags(obj.resource.Tags, this.accountConfig.includeResourceTags);
    return res;
  }
}

export default Ec2Driver;
