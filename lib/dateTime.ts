import { DateTime as LuxonDateTime } from 'luxon';
import { logger } from './logger.js';

/**
 * A class for using a consistent time during execution of a cycle of Revolver.
 */
class DateTime {
  private currentTime: LuxonDateTime;

  freezeTime(t: string) {
    this.currentTime = LuxonDateTime.fromISO(t).toUTC();
    logger.debug(`Freezing time: ${t} -> ${this.currentTime}`);
    if (this.currentTime.invalidReason) {
      logger.warn(`Invalid time: ${this.currentTime.invalidReason}: ${this.currentTime.invalidExplanation}`);
    }
  }

  freezeTimeUnix(t: string) {
    this.currentTime = LuxonDateTime.fromMillis(Number.parseInt(t)).toUTC();
    logger.debug(`Freezing time Unix: ${t} -> ${this.currentTime}`);
    if (this.currentTime.invalidReason) {
      logger.warn(`Invalid time: ${this.currentTime.invalidReason}: ${this.currentTime.invalidExplanation}`);
    }
  }

  getTime(tz?: string) {
    if (tz) {
      return this.currentTime.setZone(tz);
    }
    return this.currentTime;
  }

  /**
   * Convert a String|JSDate|LuxonDateTime to a LuxonDateTime in UTC
   * @param from - either a Date or a String that looks like a date
   * @returns a Luxon DateTime
   */
  getUtcDateTime(from: string | Date | LuxonDateTime | null): LuxonDateTime {
    if (from === null) {
      return LuxonDateTime.invalid('null');
    } else if (from instanceof LuxonDateTime) {
      return from.setZone('utc');
    } else if (from instanceof Date) {
      return LuxonDateTime.fromJSDate(from).setZone('utc');
    } else {
      return LuxonDateTime.fromISO(from).setZone('utc');
    }
  }

  /**
   * Calculate the uptime between the given date and now/frozen time, in hours.
   * @param from - the time a resource was started
   * @returns the uptime since then in hours
   */
  calculateUptime(from: LuxonDateTime): number {
    return this.currentTime.diff(from).as('hours');
  }
}

const dateTime = new DateTime();
export default dateTime;
