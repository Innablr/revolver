const winston = require('winston');
const logger = winston.loggers.get('global');

class ResourceTools {
    constructor(awsResource) {
        this.resource = awsResource;
        this.actions = [];
    }

    addAction(action) {
        if (this.actions.some(xa => xa.like(action))) {
            logger.warn('Not adding action %s on %s %s as there is already an action doing exactly that', action.what, this.resourceType, this.resourceId);
            return;
        }
        if (action.changesState && this.actions.some(xa => xa.changesState)) {
            logger.warn('Not adding action %s on %s %s as there is already actions changing resource state.', action.what, this.resourceType, this.resourceId);
            return;
        }
        if (typeof action.swallow === 'function') {
            for (const xa of this.actions
                    .filter(xxa => xxa.what === action.what)) {
                if (xa.swallow(action) === true) {
                    return;
                }
            }
        }
        this.actions.push(action);
    }

    get resourceId() {
        throw new Error('Not implemented');
    }

    get resourceType() {
        throw new Error('Not implemented');
    }

    get launchTimeUtc() {
        throw new Error('Not implemented');
    }

    get resourceState() {
        throw new Error('Not implemented');
    }

    tag(key) {
        throw new Error(`Tag ${key} is not implemented on resource ${this.resourceType}`);
    }
}

module.exports = ResourceTools;