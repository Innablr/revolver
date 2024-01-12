const AWS = require('aws-sdk');
const assume = require('../lib/assume').default;
const moment = require('moment-timezone');
const { chunkArray, paginateAwsCall } = require('../lib/common');
const { ToolingInterface } = require('./instrumentedResource');
const { ec2Tagger } = require('./tags');
const { DriverInterface } = require('./driverInterface');

class InstrumentedSnapshot extends ToolingInterface {
    get resourceId() {
        return this.resource.SnapshotId;
    }

    get resourceType() {
        return 'snapshot';
    }

    get launchTimeUtc() {
        return moment(this.resource.StartTime).tz('UTC');
    }

    tag(key) {
        const tag = this.resource.Tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }
}

class SnapshotDriver extends DriverInterface {
    stop() {
        this.logger.debug('An EBS snapshot can\'t be stopped directly, ignoring action');
        return Promise.resolve();
    }

    maskstop(resource) {
        return `EBS snapshot ${resource.resourceId} can't be stopped`;
    }

    start() {
        this.logger.debug('An EBS snapshot can\'t be started directly, ignoring action');
        return Promise.resolve();
    }

    maskstart(resource) {
        return `EBS snapshot ${resource.resourceId} can't be started`;
    }

    async setTag(resources, action) {
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        return ec2Tagger.setTag(ec2, this.logger, resources, action);
    }

    masksetTag(resource, action) {
        return ec2Tagger.masksetTag(resource, action);
    }

    async unsetTag(resources, action) {
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        return ec2Tagger.unsetTag(ec2, this.logger, resources, action);
    }

    maskunsetTag(resource, action) {
        return ec2Tagger.maskunsetTag(resource, action);
    }

    async collect() {
        const logger = this.logger;
        const that = this;
        logger.debug('Snapshot module collecting account: %j', that.accountConfig.name);

        const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);
        const ec2 = await new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        const snapshots = await ec2.describeSnapshots({OwnerIds: [this.Id]}).promise()
            .then(r => r.Snapshots);
        logger.debug('Snapshots %d found', snapshots.length);

        const volumes = await paginateAwsCall(ec2.describeVolumes.bind(ec2), 'Volumes');
        const instances = (await paginateAwsCall(ec2.describeInstances.bind(ec2), 'Reservations')).flatMap(xr => xr.Instances);

        for (const snapshot of snapshots) {
            if (snapshot.State === 'completed') {
                snapshot.volumeDetails = volumes.find(xv => xv.VolumeId === snapshot.VolumeId);
                if (snapshot.volumeDetails) {
                    const volumeDetails = snapshot.volumeDetails;
                    if (volumeDetails.State === 'in-use') {
                        const instanceId = volumeDetails.Attachments[0].InstanceId;
                        snapshot.instanceDetails = instances.find(xi => xi.InstanceId === instanceId);
                    }
                }
            }
        }

        return snapshots.map((snapshot) => new InstrumentedSnapshot(snapshot));
    }
}

module.exports = SnapshotDriver;
