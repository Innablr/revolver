const AWS = require('aws-sdk');
const assume = require('../lib/assume');
const moment = require('moment-timezone');
const ToolingInterface = require('../plugins/toolingInterface');
const {DriverInterface} = require('./driverInterface');

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

    setTag(resources, action) {
        this.logger.info('Snapshots %j will be set tags %j', resources.map(xr => xr.resourceId), action.tags);
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.EC2({credentials: creds, region: this.accountConfig.region}))
            .then(ec2 => ec2.createTags({
                Resources: resources.map(xr => xr.resourceId),
                Tags: action.tags
            }).promise());
    }

    masksetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === xt.Value)) {
            return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    unsetTag(resources, action) {
        this.logger.info('Snapshot %j will be unset tags %j', resources.map(xr => xr.resourceId), action.tags);
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.EC2({ credentials: creds, region: this.accountConfig.region }))
            .then(ec2 => ec2.deleteTags({
                Resources: resources.map(xr => xr.resourceId),
                Tags: action.tags
            }).promise());
    }

    maskunsetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === undefined)) {
            return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    async collect() {
        const logger = this.logger;
        const that = this;
        const inoperableStates = ['terminated', 'shutting-down'];
        logger.debug('Snapshot module collecting account: %j', that.accountConfig.name);

        const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);
        const ec2 = await new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        const snapshots = await ec2.describeSnapshots({OwnerIds: [this.Id]}).promise()
            .then(r => r.Snapshots);
        logger.debug('Snapshots %d found', snapshots.length);

        return Promise.all(snapshots.filter(xi => {
            if (inoperableStates.find(x => x === xi.State)) {
                logger.info('Snapshot %s state %s is inoperable', xi.SnapshotId, xi.State);
                return false;
            }
            return true;
        })
            .map(async function (snapshot) {
                if (snapshot.State === 'completed') {
                    const volumeId = snapshot.VolumeId;
                    snapshot.volumeDetails = await ec2.describeVolumes({VolumeIds: [volumeId]}).promise()
                        .catch(function () {
                            logger.debug('Volume %s parent of Snapshot %s does not exist anymore.', volumeId, snapshot.SnapshotId);
                            return [];
                        })
                        .then(r => r.Volumes ? r.Volumes[0] : []);
                    if (snapshot.volumeDetails) {
                        const volumeDetails = snapshot.volumeDetails;
                        if (volumeDetails.State === 'in-use') {
                            const instanceId = volumeDetails.Attachments[0].InstanceId;
                            snapshot.instanceDetails = await ec2.describeInstances({InstanceIds: [instanceId]}).promise()
                                .catch(function () {
                                    logger.debug('Volume %s parent of Snapshot %s does not exist anymore.', volumeId, snapshot.SnapshotId);
                                    return [];
                                })
                                .then(r => r.Reservations[0].Instances[0]);
                        }
                    }
                }
                return new InstrumentedSnapshot(snapshot);
            }));
    }
}

module.exports = SnapshotDriver;