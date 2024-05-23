import { ToolingInterface } from '../../drivers/instrumentedResource';
import dateTime from '../../lib/dateTime';
import { arrayToOr, Filter, FilterCtor } from './index';
import { DateTime as LuxonDateTime } from 'luxon';
import { logger } from '../../lib/logger';

/**
 * A Filter that compares a given from/to datetime to the current time.
 * The times are provided in ISO 8601 format - see https://en.wikipedia.org/wiki/ISO_8601
 * This resolves any datetime strings with no explicit timezone to the local timezone.
 * If the time component of datetime is omitted, a time of 00:00 is used.
 */
export default class FilterMatchWindowStart implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'match_window';
  private startTime: LuxonDateTime | undefined = undefined;
  private endTime: LuxonDateTime | undefined = undefined;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterMatchWindowStart.FILTER_NAME, config));
      } else {
        this.startTime = config.from ? LuxonDateTime.fromISO(config.from).toUTC() : undefined;
        if (this.startTime && !this.startTime.isValid) {
          logger.warn('MatchWindow "from" %s is invalid', config.from);
        }
        this.endTime = config.to ? LuxonDateTime.fromISO(config.to).toUTC() : undefined;
        if (this.endTime && !this.endTime.isValid) {
          logger.warn('MatchWindow "to" %s is invalid', config.to);
        }
        // filters with invalid times never match
        if ((this.startTime && !this.startTime.isValid) || (this.endTime && !this.endTime.isValid)) {
          this.startTime = undefined;
          this.endTime = undefined;
        }
        resolve(this);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  matches(resource: ToolingInterface): boolean {
    const now = dateTime.getTime();
    if (this.startTime && now < this.startTime) {
      return false; // too early
    }
    if (this.endTime && now > this.endTime) {
      return false; // too late
    }
    if (!this.startTime && !this.endTime) {
      return false; // no start, and no end = no match
    }
    return true;
  }
}
