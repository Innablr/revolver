const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const assume = require('../lib/assume');
const ToolingInterface = require('../plugins/toolingInterface');
const {DriverInterface} = require('./driverInterface');
const common = require('../lib/common');

class InstrumentedEc2 extends ToolingInterface {
    get resourceId() {
        return this.resource.InstanceId;
    }

    get resourceType() {
        return 'ec2';
    }

    get launchTimeUtc() {
        return moment(this.resource.LaunchTime).tz('UTC');
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

    tag(key) {
        const tag = this.resource.Tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }

    ebsTag(key) {
        const tag = this.resource.Tags.find(xt => xt.Key === key);
        if (tag !== undefined) {
            return tag.Value;
        }
    }

    inspectorAgentStatus() {
        if (this.resource.inspector) {
            return this.resource.inspector.agentHealth || 'UNKNOWN';
        }
        return 'UNKNOWN';
    }
}

class Ec2Driver extends DriverInterface {
    async initialise() {
        const logger = this.logger;
        logger.info(`Driver ${this.name} is initialising...`);
        if (this.driverConfig.inspectorAssessmentTarget) {
            logger.info('Getting default Inspector Assessment target ARN...');
            this.driverConfig.inspector = await this.getInspectorArn(this);
        }
        return Promise.resolve(this);
    }

    async getInspectorArn(account) {
        const logger = this.logger;
        const creds = await assume.connectTo(account.accountConfig.assumeRoleArn);
        const inspectorClient = new AWS.Inspector({credentials: creds, region: account.accountConfig.region});

        try {
            const targetArns = await inspectorClient.listAssessmentTargets({}).promise();
            const targets = await inspectorClient.describeAssessmentTargets({assessmentTargetArns: targetArns.assessmentTargetArns}).promise();
            const target = targets.assessmentTargets.filter(xt => xt.name === account.driverConfig.inspectorAssessmentTarget).pop();
            logger.debug('Default Inspector Assessment Target %s on account %s', target ? 'found' : 'not found', account.Id);
            return target;
        } catch (e) {
            logger.info('Default Inspector Assessment Target not found on account %s (%s).', account.Id, account.settings.name);
        }
    }

    maskstart(resource) {
        if (resource.resourceState === 'running') {
            return `EC2 instance ${resource.resourceId} is in status ${resource.resourceState}`;
        }
        if (resource.resource.InstanceLifecycle === 'spot') {
            return `EC2 instance ${resource.resourceId} is a spot instance`;
        }
    }

    async start(resources) {
        const logger = this.logger;
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const autoscaling = new AWS.AutoScaling({credentials: creds, region: this.accountConfig.region});
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        const asgs = resources
            .map(xr => xr.resource.AutoScalingGroupName)
            .filter(xa => xa)
            .reduce((x, y) => x.includes(y) ? x : [...x, y], []);

        logger.info('EC2 instances %j will start', resources.map(xr => xr.resourceId));
        await ec2.startInstances({
            InstanceIds: resources.map(xr => xr.resourceId)
        }).promise();

        if (asgs.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await Promise.all(asgs.map(function (xa) {
                logger.info('Resuming ASG %s', xa);
                return autoscaling.resumeProcesses({AutoScalingGroupName: xa}).promise()
                    .catch(e => {logger.error('Autoscaling group %s failed to resume: %s', xa, e);});
            }));
        }

        return null;
    }

    maskstop(resource) {
        if (resource.resourceState === 'stopped') {
            return `EC2 instance ${resource.resourceId} is in status ${resource.resourceState}`;
        }
        if (resource.resource.InstanceLifecycle === 'spot') {
            return `EC2 instance ${resource.resourceId} is a spot instance`;
        }
    }

    async stop(resources) {
        const logger = this.logger;
        const asgs = resources
            .map(xr => xr.resource.AutoScalingGroupName)
            .filter(xa => xa)
            .reduce((x, y) => x.includes(y) ? x : [...x, y], []);
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const autoscaling = new AWS.AutoScaling({credentials: creds, region: this.accountConfig.region});
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        await Promise.all(asgs.map(function (xa) {
            logger.info('Pausing ASG %s', xa);
            return autoscaling.suspendProcesses({AutoScalingGroupName: xa}).promise()
                .catch(e => {logger.error('Autoscaling group %s failed to resume: %s', xa, e);});
        }));

        logger.info('EC2 instances %j will stop', resources.map(xr => xr.resourceId));
        await ec2.stopInstances({
            InstanceIds: resources.map(xr => xr.resourceId)
        }).promise();

        return null;
    }

    noop(resources, action) {
        this.logger.info('EC2 instances %j will noop because: %s', resources.map(xr => xr.resourceId), action.reason);
        return Promise.resolve();
    }

    masksetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === xt.Value)) {
            return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    async setTag(resources, action) {
        this.logger.info('EC2 instances %j will be set tags %j', resources.map(xr => xr.resourceId), action.tags);
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        return ec2.createTags({
            Resources: resources.map(xr => xr.resourceId),
            Tags: action.tags
        }).promise();
    }

    maskunsetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === undefined)) {
            return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    async unsetTag(resources, action) {
        this.logger.info('EC2 instances %j will be unset tags %s', resources.map(xr => xr.resourceId), action.tags);
        const creds = await assume.connectTo(this.accountConfig.assumeRoleArn);
        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});

        return ec2.deleteTags({
            Resources: resources.map(xr => xr.resourceId),
            Tags: action.tags
        }).promise();
    }

    associateProfile(resources, action) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.EC2({credentials: creds, region: this.accountConfig.region}))
            .then(function (ec2) {
                Promise.all(resources.map(r=>{
                    logger.info('Attaching Profile %j to instance %j', action.defaultProfileName, r.resourceId);
                    ec2.associateIamInstanceProfile({
                        IamInstanceProfile: {
                            Name: action.defaultProfileName
                        },
                        InstanceId: r.resourceId
                    }).promise()
                        .then(() => logger.info('Profile %j attached to instance %j', action.defaultProfileName, r.resourceId))
                        .catch(err => logger.error(err));
                }));
            });
    }

    updateTrust(resources, action) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.IAM({credentials: creds, region: this.accountConfig.region}))
            .then(function (iam) {
                return Promise.all(resources.map(async r => {
                    const role = await iam.getRole({RoleName: r.resource.iamRoleName}).promise()
                    .then(r => r.Role);
                    const assumeRolePolicyDocument = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
                    await Promise.all(assumeRolePolicyDocument.Statement.map(statement => {
                        const attachTrusts = action.trusts.map(t => t);
                        // check if trust already exists in the role
                        attachTrusts.forEach(indTrust => {
                            if (!statement.Principal.Service.includes(indTrust)) {
                                logger.info('Updating trusts %j on attached profile %j on instance %j', action.trusts.map(t => t), r.resource.iamRoleName, r.resourceId);
                                if (statement.Action.toLowerCase() === 'sts:assumerole') {
                                    if (typeof statement.Principal.Service === 'string') {
                                        attachTrusts.push(statement.Principal.Service);
                                    }
                                    else {
                                        statement.Principal.Service.forEach(service => {
                                            attachTrusts.push(service);
                                        });
                                    }
                                    statement.Principal.Service = Array.from(new Set(attachTrusts));
                                    iam.updateAssumeRolePolicy({
                                        PolicyDocument: JSON.stringify(assumeRolePolicyDocument),
                                        RoleName: r.resource.iamRoleName
                                    }).promise()
                                    .then(() => {
                                        logger.info('Profile %j updated.', r.resource.iamRoleName);
                                    })
                                    .catch(err => {
                                        logger.error(err);
                                    });
                                }
                            }
                        });
                    }));
                }));
            });
    }

    async attachPolicy(resources, action) {
        const logger = this.logger;
        return assume.connectTo(this.accountConfig.assumeRoleArn)
            .then(creds => new AWS.IAM({credentials: creds, region: this.accountConfig.region}))
            .then(function (iam) {
                return Promise.all(resources.map(async r => {
                    await Promise.all(action.policies.map(async policy => {
                        const listOfPolicy = await iam.listAttachedRolePolicies({
                            RoleName: r.resource.iamRoleName
                        }).promise();
                        if (!listOfPolicy.AttachedPolicies.some(item => item.PolicyArn === policy)) {
                            logger.info('Attaching policy %j to attached profile %j on instance %j', policy, r.resource.iamRoleName, r.resourceId);
                            await iam.attachRolePolicy({
                                PolicyArn: policy,
                                RoleName: r.resource.iamRoleName
                            }).promise()
                            .then(() => {
                                logger.info('Policy attached.');
                            })
                            .catch(err => {
                                logger.error(err);
                            });
                        }
                    }));
                }));
            });
    }

    async collect() {
        const logger = this.logger;
        const that = this;
        const inoperableStates = ['terminated', 'shutting-down'];
        logger.debug('EC2 module collecting account: %j', that.accountConfig.name);

        const creds = await assume.connectTo(that.accountConfig.assumeRoleArn);

        const ec2 = new AWS.EC2({credentials: creds, region: this.accountConfig.region});
        const autoscaling = new AWS.AutoScaling({credentials: creds, region: this.accountConfig.region});
        const cloudwatch = new AWS.CloudWatch({credentials: creds, region: this.accountConfig.region});
        const ssm = new AWS.SSM({credentials: creds, region: this.accountConfig.region});
        const inspector = new AWS.Inspector({credentials: creds, region: this.accountConfig.region});
        const iam = new AWS.IAM({credentials: creds, region: this.accountConfig.region});

        const ec2Instances = await ec2.describeInstances({}).promise()
            .then(r => r.Reservations.reduce((instances, reservation) => instances.concat(reservation.Instances), []))
            .then(i => i.filter(function (xi) {
                if (inoperableStates.find(x => x === xi.State.Name)) {
                    logger.info('EC2 instance %s state %s is inoperable', xi.InstanceId, xi.State.Name);
                    return false;
                }
                return true;
            }));
        const autoscalingGroups = await autoscaling.describeAutoScalingGroups({}).promise();
        const ssmAgentStatus = await common.paginateAwsCall(ssm.describeInstanceInformation.bind(ssm), 'InstanceInformationList');
        const inspectorPreviewAgents = this.driverConfig.inspector
            ? await common.paginateAwsCall(inspector.describeInstanceInformation.bind(inspector), 'InstanceInformationList', {previewAgentsArn: that.accountConfig.inspector.arn})
            : undefined;
        const instanceProfiles = await ec2.describeIamInstanceProfileAssociations({}).promise()
            .then(r => Promise.all(r.IamInstanceProfileAssociations.map(async profile => {
                    let profileInfo;
                    const profileName = profile.IamInstanceProfile.Arn.split('/').pop();
                    try {
                        profileInfo = await iam.getInstanceProfile({InstanceProfileName: profileName}).promise();
                        profile.roles = profileInfo.InstanceProfile.Roles
                        return profile;
                    } catch (e) {
                        logger.error('Unable to fetch profile %s: %s', profileName, e);
                        return undefined;
                    }
                })))
            .then(r => r.filter(xr => xr !== undefined));

        ec2Instances.forEach(xi => {
            const asg = autoscalingGroups.AutoScalingGroups.find(xa => xa.Instances.find(xai => xai.InstanceId === xi.InstanceId) !== undefined);
            xi.AutoScalingGroupName = asg ? asg.AutoScalingGroupName : undefined;
            xi.ssmAgentStatus = ssmAgentStatus.find(xa => xa.InstanceId === xi.InstanceId);
            xi.instanceProfile = instanceProfiles.find(xa => xa.InstanceId === xi.InstanceId);
            if (this.driverConfig.inspector) {
                xi.inspector = inspectorPreviewAgents.find(xa => xa.agentId === xi.InstanceId);
                if (xi.inspector !== undefined) {
                    logger.info(`Instance ${xi.InstanceId} has an Inspector agent`);
                }
            }
            if (xi.AutoScalingGroupName !== undefined) {
                logger.info(`Instance ${xi.InstanceId} is member of ASG ${xi.AutoScalingGroupName}`);
            }

            if (xi.instanceProfile !== undefined) {
                xi.iamProfileName = xi.instanceProfile.IamInstanceProfile.Arn.split('/').pop();
                xi.iamRoleName = xi.instanceProfile.roles[0].RoleName;
            }
        });

        return ec2Instances.map(function (xi) {
            return new InstrumentedEc2(xi);
        });
    }
}

module.exports = Ec2Driver;
