const winston = require('winston');

class RevolverPlugin {
    constructor(accountConfig, pluginName, pluginConfig) {
        this.accountConfig = accountConfig.settings;
        this.accountId = accountConfig.Id;
        this.pluginConfig = pluginConfig;
        this.pluginConfig.name = pluginName;
        this.logger = winston.loggers.get(this.accountConfig.name);
        this.logger.debug(`Initialising plugin ${this.name} for account ${this.accountConfig.name}`);
    }

    get name() {
        return this.pluginConfig.name;
    }

    get supportedResources() {
        return this.constructor.supportedResources;
    }

    initialise() {
        this.logger.info(`Plugin ${this.name} is initialising...`);
        return Promise.resolve(this);
    }

    isApplicable(resource) {
        const that = this;
        if (Array.isArray(this.supportedResources)) {
            const supported = this.supportedResources.find(function(xs) {
                if (typeof xs === 'function') {
                    return xs.call(that, resource) === true;
                }
                return xs === resource.resourceType;
            });
            return supported !== undefined;
        }
        return true;
    }

    generateActions(resource) {
        throw new Error(`generateActions is not implemented in plugin ${this.name} for resource ${resource.resourceId}`);
    }
}

module.exports = RevolverPlugin;