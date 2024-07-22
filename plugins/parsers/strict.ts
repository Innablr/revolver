import { DateTime, Interval } from 'luxon';

const zeroPad = (num: number, places: number) => String(num).padStart(places, '0');
export const reasonDateFormat = 'ccc T Z'; //  Format is 'Wed 15:02 +11'

class ParsedComponent {
  private timeHourLiteral: string | null = null;
  private timeMinuteLiteral: string | null;
  private dayFrom: number | null = null;
  private dayTo: number | null = null;
  private parsed: boolean = false;
  private hasDays: boolean;
  private re: RegExp;

  static get weekdays() {
    return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  }

  get timeHour(): number {
    if (this.timeHourLiteral === null) {
      return 0;
    }
    return parseInt(this.timeHourLiteral);
  }

  get timeMinute(): number {
    if (this.timeMinuteLiteral === null) {
      return 0;
    }
    return parseInt(this.timeMinuteLiteral);
  }

  get time() {
    return `${this.timeHour}:${zeroPad(this.timeMinute, 2)}`;
  }

  get days() {
    if (this.dayFrom !== null && this.dayTo !== null) {
      return `${ParsedComponent.weekdays[this.dayFrom - 1]}-${ParsedComponent.weekdays[this.dayTo - 1]}`;
    }
    return null;
  }

  get isSet(): boolean {
    return this.parsed;
  }

  parse(tag: string) {
    const m = tag.toLowerCase().match(this.re);

    if (m === null) {
      return false;
    }

    const [, , time, , days] = m;
    [this.timeHourLiteral, this.timeMinuteLiteral] = time.split(':');
    if (days !== undefined) {
      this.hasDays = true;
      [this.dayFrom, this.dayTo] = m[4].split('-').map((xd) => ParsedComponent.weekdays.indexOf(xd) + 1);
    }

    return true;
  }

  constructor(tag: string, component: string) {
    this.re = new RegExp(`(${component}=([0-9]{1,2}:[0-9]{1,2}))(\\|([a-z]{3}-[a-z]{3}))?`);

    this.parsed = this.parse(tag);
  }

  dayIn(d: number): boolean {
    if (this.days === null) {
      return true;
    }
    if (this.dayFrom! > this.dayTo!) {
      return d <= this.dayTo! || this.dayFrom! <= d;
    }
    return this.dayFrom! <= d && d <= this.dayTo!;
  }

  timeEqualOrPast(t: DateTime) {
    return t.set({ hour: this.timeHour, minute: this.timeMinute }) <= t;
  }
}

class ParsedAvailability {
  public tag: string;
  public start: ParsedComponent;
  public stop: ParsedComponent;
  public override: boolean;
  public available: '24x7' | '0x7' | '24x5' | null;

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
    return !this.start.isSet && !this.stop.isSet;
  }

  get isWindow() {
    return this.start.isSet && this.stop.isSet;
  }

  constructor(tag: string) {
    this.tag = tag.replace('/', ';').replace('_', '|').toLowerCase();
    this.override = this.parseOverride();
    this.available = this.parseLiteralAvailability();
    this.start = new ParsedComponent(this.tag, 'start');
    this.stop = new ParsedComponent(this.tag, 'stop');
  }

  timeIn(t: DateTime) {
    if (!this.isWindow) {
      return null;
    }
    const startTime = t.set({ hour: this.start.timeHour, minute: this.start.timeMinute });
    const stopTime = t.set({ hour: this.stop.timeHour, minute: this.stop.timeMinute });
    if (startTime > stopTime) {
      return stopTime > t || t >= startTime;
    }
    return Interval.fromDateTimes(startTime, stopTime).contains(t);
  }

  dayIn(t: DateTime) {
    const d = t.weekday;
    const sideDayIn = this.start.days === null ? this.stop.dayIn.bind(this.stop) : this.start.dayIn.bind(this.start);
    if (this.isWindow) {
      const startTime = t.set({ hour: this.start.timeHour, minute: this.start.timeMinute });
      const stopTime = t.set({ hour: this.stop.timeHour, minute: this.stop.timeMinute });
      if (startTime > stopTime) {
        if (sideDayIn(d)) {
          return true;
        }
        if (t < stopTime && sideDayIn(d === 1 ? 7 : d - 1)) {
          return true;
        } else if (t >= startTime && sideDayIn(d === 7 ? 1 : d + 1)) {
          return true;
        }
        return false;
      }
    }
    return sideDayIn(d);
  }
}

function startOrStop(tag: string, timeNow: DateTime) {
  const t = new ParsedAvailability(tag);
  if (t.override === true) {
    return ['NOOP', 'Availability override'];
  } else if (t.available === '24x7') {
    return ['START', 'Availability 24x7'];
  } else if (t.available === '0x7') {
    return ['STOP', 'Availability 0x7'];
  } else if (t.available === '24x5') {
    const w = timeNow.weekday;
    const r = `Availability 24x5 and it is ${timeNow.toFormat('cccc')} now`;
    if (w >= 1 && w <= 5) {
      return ['START', r];
    }
    return ['STOP', r];
  }

  if (t.isInvalid) {
    return ['UNPARSEABLE', `Tag ${tag} is invalid, both start and stop specification are unreadable`];
  }

  if (t.isWindow) {
    const r = `It's ${timeNow.toFormat(reasonDateFormat)}, availability is from ${t.start.time} till ${t.stop.time} ${
      t.days ? t.days : 'all week'
    }`;
    if (t.timeIn(timeNow) && t.dayIn(timeNow)) {
      return ['START', r];
    }
    return ['STOP', r];
  }

  if (t.start.isSet) {
    const r = `It's now ${timeNow.toFormat(reasonDateFormat)}, resource starts at ${t.start.time} ${t.days ? t.days : 'all week'}`;
    if (t.dayIn(timeNow)) {
      if (t.start.timeEqualOrPast(timeNow) && !t.start.timeEqualOrPast(timeNow.minus({ minutes: 15 }))) {
        return ['START', r];
      }
    }
    return ['NOOP', r];
  }

  if (t.stop.isSet) {
    const r = `It's now ${timeNow.toFormat(reasonDateFormat)}, resource stops at ${t.stop.time} ${t.days ? t.days : 'all week'}`;
    if (t.dayIn(timeNow)) {
      if (t.stop.timeEqualOrPast(timeNow) && !t.stop.timeEqualOrPast(timeNow.minus({ minutes: 15 }))) {
        return ['STOP', r];
      }
    }
    return ['NOOP', r];
  }

  return ['UNPARSEABLE', `Can't figure out what to do with ${tag} at ${timeNow}`];
}

export default startOrStop;
