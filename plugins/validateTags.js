const PluginInterface = require('./pluginInterface');
const actions = require('../lib/actions');
const dateTime = require('../lib/dateTime');

class ValidateTagsPlugin extends PluginInterface {
    setActions(resource, actionsDef, tag, message) {
        const logger = this.logger;
        const that = this;
        const utcTimeNow = dateTime.getTime('utc');

        (actionsDef || []).forEach(function (xa) {
            switch (xa) {
                case 'copyFromParent':
                    resource.addAction(new actions.SetTagAction(that, tag, message));
                    break;
                case 'warn':
                case 'warning':
                    resource.addAction(new actions.SetTagAction(that, `Warning${tag}`, message));
                    break;
                case 'stop':
                    if (utcTimeNow.diff(resource.launchTimeUtc, 'minutes') > 30) {
                        resource.addAction(new actions.StopAction(that));
                    } else {
                        resource.addAction(new actions.NoopAction(that,
                            `${resource.resourceType} ${resource.resourceId} would've been stopped because tag ${tag} is missing but it was created less than 30 minutes ago`));
                    }
                    break;
                default:
                    logger.error('Action %s is not supported by %s', xa.action, that.name);
            }
        });
    }

    generateActions(resource) {
        const tags = this.pluginConfig.tag;
        Promise.all((Array.isArray(tags) ? tags : tags.split()).filter(xi => xi).map(xa => {
            this.logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}...`);
            const tag = resource.tag(xa);

            if (tag === undefined) {
                const resourceType = resource.resourceType;
                if (this.pluginConfig.allow_set_from_parent && (resourceType === 'ebs' || resourceType === 'snapshot')) {
                    // Try to get the tags from parent instance (ebs and snapshots)
                    if (resource.resource.instanceDetails && resource.resource.instanceDetails.Tags) {
                        const instanceTag = resource.resource.instanceDetails.Tags.find(xi => xi.Key === xa);
                        if (instanceTag) {
                            this.setActions(resource, ['copyFromParent'], xa, instanceTag.Value);
                            this.logger.debug('Tag %s found on instance parent with value %s and will attach to the %s %s', instanceTag.Key, instanceTag.Value, resource, resourceType, resource.resourceId);
                            return xa;
                        }
                    }
                    // Try to get the tags from parent volume (only snapshots)
                    if (resource.resource.volumeDetails && resource.resource.volumeDetails.Tags) {
                        const volumeTag = resource.resource.volumeDetails.Tags.find(xi => xi.Key === xa);
                        if (volumeTag) {
                            this.setActions(resource, ['copyFromParent'], xa, volumeTag.Value);
                            this.logger.debug('Tag %s found on volume parent with value %s and will attach to the snapshot %s', volumeTag.Key, volumeTag.Value, resource.resourceId);
                            return xa;
                        }
                    }
                }
                // No tags retrieved from parents, add warning ones
                this.logger.debug('Tag %s not found, attaching missing tag to %s %s', xa, resource.resourceType, resource.resourceId);
                this.setActions(resource, this.pluginConfig.tag_missing, xa, `Tag ${xa} is missing`);
                return xa;
            }

            if (this.pluginConfig.match) {
                const re = new RegExp(this.pluginConfig.match);
                if (!re.test(tag)) {
                    this.setActions(resource, this.pluginConfig.tag_not_match, xa, `Tag ${xa} doesn't match regex /${this.pluginConfig.match}/`);
                }
                return xa;
            }

            this.logger.debug('%s: %s %s tag [%s] = [%s], validation successful, removing warning tag',
                this.name, resource.resourceType, resource.resourceId, xa, tag);
            resource.addAction(new actions.UnsetTagAction(this, `Warning${xa}`));

            return xa;
        }))
            .then(() => Promise.resolve(resource));
    }
}

ValidateTagsPlugin.supportedResources = ['ec2', 'ebs', 'snapshot', 'rdsInstance', 'rdsMultiAz', 'rdsCluster', 'redshiftCluster'];

module.exports = ValidateTagsPlugin;