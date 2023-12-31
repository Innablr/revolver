const moment = require('moment-timezone');

class ParsedComponent {
    static get weekdays() {
        return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    }

    get time() {
        return `${this.timeHour}:${this.timeMinute}`;
    }

    get days() {
        if (this.dayFrom !== null && this.dayTo !== null) {
            return `${ParsedComponent.weekdays[this.dayFrom - 1]}-${ParsedComponent.weekdays[this.dayTo - 1]}`;
        }
        return null;
    }

    parse(tag) {
        const m = tag.toLowerCase().match(this.re);

        if (m === null) {
            return false;
        }

        const [, , time, , days] = m;
        [this.timeHour, this.timeMinute] = time.split(':');
        if (days !== undefined) {
            this.hasDays = true;
            [this.dayFrom, this.dayTo] = m[4].split('-').map(xd => ParsedComponent.weekdays.indexOf(xd) + 1);
        }

        return true;
    }

    constructor(tag, component) {
        this.re = new RegExp(`(${component}=([0-9]{1,2}:[0-9]{1,2}))(\\|([a-z]{3}-[a-z]{3}))?`);
        this.timeHour = null;
        this.timeMinute = null;
        this.dayFrom = null;
        this.dayTo = null;

        this.isSet = this.parse(tag);
    }

    dayIn(d) {
        if (this.days === null) {
            return true;
        }
        if (this.dayFrom > this.dayTo) {
            return d <= this.dayTo || this.dayFrom <= d;
        }
        return this.dayFrom <= d && d <= this.dayTo;
    }

    timePast(t) {
        return t.clone().set({hour: this.timeHour, minute: this.timeMinute}) < t;
    }
}

class ParsedAvailability {
    parseOverride() {
        const m = this.tag.match(/override(=(on|off|yes|no))?/);

        if (m !== null) {
            if (m[1] === undefined) {
                return true;
            }
            if (m[2] === 'yes' || m[2] === 'on') {
                return true;
            }
        }

        return false;
    }

    parseLiteralAvailability() {
        if (/24x7/.test(this.tag)) {
            return '24x7';
        }
        if (/24x5/.test(this.tag)) {
            return '24x5';
        }
        if (/0x/.test(this.tag)) {
            return '0x7';
        }

        return null;
    }

    get days() {
        return this.start.days || this.stop.days;
    }

    get isInvalid() {
        return ! this.start.isSet && ! this.stop.isSet;
    }

    get isWindow() {
        return this.start.isSet && this.stop.isSet;
    }

    constructor(tag) {
        this.tag = tag.replace('/', ';').replace('_', '|')
            .toLowerCase();
        this.override = this.parseOverride();
        this.available = this.parseLiteralAvailability();
        this.start = new ParsedComponent(this.tag, 'start');
        this.stop = new ParsedComponent(this.tag, 'stop');
    }

    timeIn(t) {
        const startTime = t.clone().set({hour: this.start.timeHour, minute: this.start.timeMinute});
        const stopTime = t.clone().set({hour: this.stop.timeHour, minute: this.stop.timeMinute});
        if (startTime > stopTime) {
            return stopTime > t || t >= startTime;
        }
        return t.isBetween(startTime, stopTime);
    }

    dayIn(t) {
        const d = t.isoWeekday();
        const startTime = t.clone().set({hour: this.start.timeHour, minute: this.start.timeMinute});
        const stopTime = t.clone().set({hour: this.stop.timeHour, minute: this.stop.timeMinute});
        const dayIn = this.start.days === null ? this.stop.dayIn.bind(this.stop) : this.start.dayIn.bind(this.start);
        if (this.isWindow && startTime > stopTime) {
            if (dayIn(d)) {
                return true;
            }
            if (t < stopTime && dayIn(d === 1 ? 7 : d - 1)) {
                return true;
            } else if (t >= startTime && dayIn(d === 7 ? 1 : d + 1)) {
                return true;
            }
            return false;
        }
        return dayIn(d);
    }
}

function startOrStop(tag, timeNow) {
    if (! (timeNow instanceof moment)) {
        throw new Error(`Time must be instance of moment.js, not ${timeNow}`);
    }

    const t = new ParsedAvailability(tag);
    if (t.override === true) {
        return ['NOOP', 'Availability override'];
    }
    else if (t.available === '24x7') {
        return ['START', 'Availability 24x7'];
    }
    else if (t.available === '0x7') {
        return ['STOP', 'Availability 0x7'];
    }
    else if (t.available === '24x5') {
        const w = timeNow.isoWeekday();
        const r = `Availability 24x5 and it is ${timeNow.format('dddd')} now`;
        if ( w >= 1 && w <= 5 ) {
            return ['START', r];
        }
        return ['STOP', r];
    }

    if (t.isInvalid) {
        return ['UNPARSEABLE', `Tag ${tag} is invalid, both start and stop specification are unreadable`];
    }

    if (t.isWindow) {
        const r = `It's ${timeNow}, availability is from ${t.start.time} till ${t.stop.time} ${t.days ? t.days : 'all week'}`;
        if (t.timeIn(timeNow) && t.dayIn(timeNow)) {
            return ['START', r];
        }
        return ['STOP', r];
    }

    if (t.start.isSet) {
        const r = `It's now ${timeNow}, resource starts at ${t.start.time} ${t.days ? t.days : 'all week'}`;
        if (t.dayIn(timeNow)) {
            if (t.start.timePast(timeNow) && ! t.start.timePast(timeNow.clone().subtract(15, 'minutes'))) {
                return ['START', r];
            }
        }
        return ['NOOP', r];
    }

    if (t.stop.isSet) {
        const r = `It's now ${timeNow}, resource stops at ${t.stop.time} ${t.days ? t.days : 'all week'}`;
        if (t.dayIn(timeNow)) {
            if (t.stop.timePast(timeNow) && ! t.stop.timePast(timeNow.clone().subtract(15, 'minutes'))) {
                return ['STOP', r];
            }
        }
        return ['NOOP', r];
    }

    return ['UNPARSEABLE', `Can't figure out what to do with ${tag} at ${timeNow}` ];
}

module.exports = startOrStop;