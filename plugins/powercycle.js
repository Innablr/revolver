const getParser = require('./parsers/all');
const PluginInterface = require('./pluginInterface');
const dateTime = require('../lib/dateTime');
const actions = require('../lib/actions');

class PowerCyclePlugin extends PluginInterface {
    constructor(...args) {
        super(...args);
        this.parser = getParser(this.pluginConfig.tagging || 'strict');
        this.scheduleTagName = this.pluginConfig.availability_tag || 'Schedule';
        this.timezoneTagName = this.accountConfig.timezone_tag || 'Timezone';
        this.warningTagName = `Warning${this.scheduleTagName}`;
        this.reasonTagName = `Reason${this.scheduleTagName}`;
    }

    generateActions(resource) {
        const logger = this.logger;
        const scheduleTag = resource.tag(this.scheduleTagName);
        const tz = resource.tag(this.timezoneTagName) || this.accountConfig.timezone || 'utc';
        const localTimeNow = dateTime.getTime(tz);
        logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}, timezone ${tz}`);

        if (scheduleTag === undefined) {
            logger.debug('Tag "%s" is missing, not analysing availability', this.scheduleTagName);
            resource.addAction(new actions.SetTagAction(this, this.warningTagName, `Tag ${this.scheduleTagName} is missing`));
            return Promise.resolve(resource);
        }

        logger.debug('Checking availability %j', scheduleTag);
        const [r, reason] = this.parser(scheduleTag, localTimeNow);

        switch (r) {
            case 'UNPARSEABLE':
                logger.warn('Tag %s couldn\'t be parsed: %s', scheduleTag, reason);
                resource.addAction(new actions.SetTagAction(this, this.warningTagName, reason));
                break;
            case 'START':
                logger.debug('Resource should be started: %s', reason);
                resource.addAction(new actions.StartAction(this));
                if (resource.resourceState !== 'running') {
                    resource.addAction(new actions.SetTagAction(this, this.reasonTagName, reason));
                }
                break;
            case 'STOP':
                logger.debug('Resource should be stopped: %s', reason);
                resource.addAction(new actions.StopAction(this));
                if (resource.resourceState === 'running') {
                    resource.addAction(new actions.SetTagAction(this, this.reasonTagName, reason));
                }
                break;
            case 'NOOP':
                logger.debug('Resource should be left alone: %s', reason);
                resource.addAction(new actions.NoopAction(this, reason));
                break;
            default:
                logger.error('Availability parser returns [%s], which is not supported');
        }

        logger.debug('Finally got actions: %j', resource.actions.map(xa => xa.what));
        return Promise.resolve(resource);
    }
}

PowerCyclePlugin.supportedResources = ['ec2', 'rdsCluster', 'rdsInstance', 'rdsMultiAz', 'rdsMultiAzSnapshot', 'rdsClusterSnapshot', 'redshiftCluster', 'redshiftClusterSnapshot'];

module.exports = PowerCyclePlugin;