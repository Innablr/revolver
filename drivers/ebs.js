const AWS = require('aws-sdk');
const assume = require('../lib/assume');
const moment = require('moment-timezone');
const common = require('../lib/common');
const ToolingInterface = require('../plugins/toolingInterface');
const {DriverInterface} = require('./driverInterface');

class InstrumentedEBS extends ToolingInterface {
    get resourceId() {
        return this.resource.VolumeId;
    }

    get resourceType() {
        return 'ebs';
    }

    get launchTimeUtc() {
        return moment(this.resource.CreateTime).tz('UTC');
    }

    tag(key) {
        const tag = this.resource.Tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }
}

class EBSDriver extends DriverInterface {
    masksetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === xt.Value)) {
            return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    stop() {
        this.logger.debug('An EBS volume can\'t be stopped directly, ignoring action');
        return Promise.resolve();
    }

    maskstop(resource) {
        return `EBS volume ${resource.resourceId} can't be stopped`;
    }

    start() {
        this.logger.debug('An EBS volume can\'t be started directly, ignoring action');
        return Promise.resolve();
    }

    maskstart(resource) {
        return `EBS volume ${resource.resourceId} can't be started`;
    }

    async setTag(resources, action) {
        this.logger.info('EBS volumes %j will be set tags %j', action.tags);
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        return ec2.createTags({
            Resources: resources.map(xr => xr.resourceId),
            Tags: action.tags
        }).promise();
    }

    noop(resources, action) {
        this.logger.info('EBS volumes %j will noop because: %s', resources.map(xr => xr.resourceId), action.reason);
        return Promise.resolve();
    }

    maskunsetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === undefined)) {
            return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    async unsetTag(resources, action) {
        this.logger.info('EBS volumes %j will be unset tags %j', resources.map(xr => xr.resourceId), action.tags);
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});
        return ec2.deleteTags({
            Resources: resources.map(xr => xr.resourceId),
            Tags: action.tags
        }).promise();
    }

    async collect() {
        const logger = this.logger;
        const that = this;
        logger.debug('EBS module collecting account: %j', that.accountConfig.name);

        const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);
        const ec2 = await new AWS.EC2({ credentials: creds, region: this.accountConfig.region });

        const ebsVolumes = await ec2.describeVolumes({}).promise().then(r => r.Volumes);
        const ec2instances = (await common.paginateAwsCall(ec2.describeInstances.bind(ec2), 'Reservations')).flatMap(xr => xr.Instances);

        logger.debug('Found %d ebs volumes', ebsVolumes.length);

        for (const volume of ebsVolumes) {
            if (volume.State === 'in-use') {
                const instanceId = volume.Attachments[0].InstanceId;
                volume.instanceDetails = ec2instances.find(xi => xi.InstanceId === instanceId);
            }
        }

        return ebsVolumes.map((xe) => new InstrumentedEBS(xe));
    }
}

module.exports = EBSDriver;
