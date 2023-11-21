const winston = require('winston');

class DriverInterface {
    constructor(accountConfig, driverConfig) {
        this.accountConfig = accountConfig.settings;
        this.Id = accountConfig.Id;
        this.driverConfig = driverConfig;
        this.logger = winston.loggers.get(this.accountConfig.name);
        this.logger.debug(`Initialising driver ${this.name} for account ${this.accountConfig.name}`);
    }

    get name() {
        return this.driverConfig.name;
    }

    recogniseResource(r) {
        return r.resourceType === this.name;
    }

    pretendAction(resources, action) {
        this.logger.info('Pretending that %s resources %j will %s', this.name, resources.map(xr => xr.resourceId), action.present);
    }

    initialise() {
        this.logger.info(`Driver ${this.name} is initialising...`);
        return Promise.resolve(this);
    }

    processActions(resources) {
        const logger = this.logger;
        logger.info(`Driver ${this.name} is processing actions...`);
        const that = this;
        return Promise.all(resources.reduce(function(o, xr) {
            logger.debug('Aggregating actions for %s', xr.resourceId);
            const a = xr.actions.map(function(xa) {
                logger.debug('Got action %s for %s', xa.present, xr.resourceId);
                const allWithAction = resources.filter(function(xxr) {
                    const matchingAction = xxr.actions.find(xxa => {
                        logger.debug('Checking action %s on resource %s: like %s, done %s', xxa.present, xxr.resourceId, xxa.like(xa), xxa.done);
                        return xxa.like(xa) && ! xxa.done;
                    });
                    if (matchingAction === undefined) {
                        logger.debug('No action matching %s on resource %s', xa.present, xxr.resourceId);
                        return false;
                    }
                    logger.debug('Resource %s also has action %s', xxr.resourceId, matchingAction.present);
                    if (typeof that[`mask${matchingAction.what}`] === 'function') {
                        logger.debug(`Masking available on ${that.name} for ${matchingAction.what}. Executing...`);
                        const reason = that[`mask${matchingAction.what}`](xxr, matchingAction);
                        if (reason !== undefined) {
                            logger.info(`${xxr.resourceType} ${xxr.resourceId} is rejecting ${matchingAction.present} because ${reason}`);
                            matchingAction.done = true;
                            return false;
                        }
                    }
                    matchingAction.done = true;
                    return true;
                });
                if (! allWithAction.length > 0) {
                    logger.info(`Not executing ${xa.present} on ${xr.resourceId} because all resources have either rejected the action or been already processed`);
                    return null;
                }
                if (that.driverConfig.pretend !== false) {
                    logger.info('Pretending that %s will execute %s on %s %j', xa.who.name, xa.present, xr.resourceType, allWithAction.map(xxr => xxr.resourceId));
                    return that.pretendAction(allWithAction, xa);
                }
                logger.info('%s will execute %s on %s %j', xa.who.name, xa.present, xr.resourceType, allWithAction.map(xxr => xxr.resourceId));
                return that[xa.what](allWithAction, xa).catch(function(err) {
                    logger.error('Error in driver %s processing action [%s] on resources %j, stack trace will follow:', that.name, xa.present, allWithAction.map(xxr => xxr.resourceId));
                    logger.error(err);
                });
            });
            return o.concat(a.filter(xa => xa));
        }, []));
    }

    collect() {
        throw new Error('Not implemented');
    }
}

class RDSTagger {
    static setTag(rds, logger, resources, action) {
        return Promise.all(resources.map(async function(xr) {
            const safeValues = action.tags.map(xt =>
                ({Key: xt.Key, Value: xt.Value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_')}));
            logger.info('%s %s will be set tag %j', xr.resourceType, xr.resourceId, safeValues);
            try {
                return await rds.addTagsToResource({
                    ResourceName: xr.resourceArn,
                    Tags: safeValues
                }).promise();
            } catch (e) {
                logger.error('Error settings tags for %s %s, stack trace will follow:', xr.resourceType, xr.resourceId);
                logger.error(e);
            }
        }));
    }

    static masksetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === xt.Value)) {
            return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }

    static unsetTag(rds, logger, resources, action) {
        return Promise.all(resources.map(async function(xr) {
            logger.info('RDS instance %s will be unset tags %j', xr.resourceId, action.tags);
            try {
                return await rds.removeTagsFromResource({
                    ResourceName: xr.resourceArn,
                    TagKeys: action.tags
                }).promise();
            } catch (e) {
                logger.error('Error unsettings tags for %s %s, stack trace will follow:', xr.resourceType, xr.resourceId);
                logger.error(e);
            }
        }));
    }

    static maskunsetTag(resource, action) {
        if (action.tags.every(xt => resource.tag(xt.Key) === undefined)) {
            return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(action.tags.map(xt => xt.Key))}`;
        }
    }
}

module.exports = {
    DriverInterface,
    RDSTagger
};
