const moment = require('moment-timezone');
const winston = require('winston');

class DateTime {
    constructor() {
        this.currentTime = undefined;
    }

    freezeTime(t) {
        const logger = winston.loggers.get('global');
        this.currentTime = moment.utc(t);
        logger.debug('Freezing time: %s', this.currentTime);
    }

    getTime(tz) {
        if (tz) {
            return this.currentTime.clone().tz(tz);
        }
        return this.currentTime.clone();
    }
}

module.exports = new DateTime();