import { DateTime } from 'luxon';
import { AutoScalingClient, ResumeProcessesCommand, SuspendProcessesCommand, paginateDescribeAutoScalingGroups } from '@aws-sdk/client-auto-scaling';
import { Instance, Tag, EC2Client, StartInstancesCommand, StopInstancesCommand, paginateDescribeInstances } from '@aws-sdk/client-ec2';
import { InstrumentedResource, ToolingInterface } from "./instrumentedResource";
import { DriverInterface } from './driverInterface';
import { RevolverAction, RevolverActionWithTags } from '../actions/actions';
import { chunkArray, paginateAwsCall } from '../lib/common';
import { ec2Tagger } from './tags';
import { getAwsClientForAccount } from '../lib/awsConfig';

class InstrumentedEc2 extends ToolingInterface {
  private instanceARN: string;

  constructor(resource: Instance, instanceARN: string) {
    super(resource);
    this.instanceARN = instanceARN;
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
    return DateTime.fromISO(this.resource.LaunchTime).setZone('utc');
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
    const tag = this.resource.Tags.find((xt: Tag) => xt.Key === key);
    if (tag !== undefined) {
      return tag.Value;
    }
  }

  ebsTag(key: string) {
    const tag = this.resource.Tags.find((xt: Tag) => xt.Key === key);
    if (tag !== undefined) {
      return tag.Value;
    }
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
        logger.info(`EC2 instances ${chunk.map((xr) => xr.resourceId)} will start`);
        return ec2.send(new StartInstancesCommand({
          InstanceIds: chunk.map((xr) => xr.resourceId),
        }));
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
        logger.info(`EC2 instances ${chunk.map((xr) => xr.resourceId)} will stop`);
        return ec2.send(new StopInstancesCommand({
          InstanceIds: chunk.map((xr) => xr.resourceId),
        }));
      }),
    );

    return null;
  }

  noop(resources: InstrumentedEc2[], action: RevolverAction) {
    this.logger.info(`EC2 instances ${resources.map((xr) => xr.resourceId)} will noop because: ${action.reason}`);
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

    const autoscalingGroups = await paginateAwsCall(paginateDescribeAutoScalingGroups, autoscaling, 'AutoScalingGroups');

    for (const xi of ec2Instances) {
      const asg = autoscalingGroups.find(
        (xa) => xa.Instances.find((xai: Instance) => xai.InstanceId === xi.InstanceId) !== undefined,
      );
      xi.AutoScalingGroupName = asg ? asg.AutoScalingGroupName : undefined;
      if (xi.AutoScalingGroupName !== undefined) {
        logger.info(`Instance ${xi.InstanceId} is member of ASG ${xi.AutoScalingGroupName}`);
      }
    }

    return ec2Instances.map(
      (xi) =>
        new InstrumentedEc2(xi, `arn:aws:ec2:${this.accountConfig.region}:${this.accountId}:volume/${xi.InstanceId}`),
    );
  }

  resource(obj: InstrumentedResource): ToolingInterface {
    return new InstrumentedEc2(obj.resource, obj.resourceArn);
  }
}

export default Ec2Driver;
