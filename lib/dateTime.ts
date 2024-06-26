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
    this.currentTime = LuxonDateTime.fromMillis(parseInt(t)).toUTC();
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
   * Convert either a String or a JSDate to a LuxonDateTime in UTC
   * @param from - either a Date or a String that looks like a date
   * @returns a Luxon DateTime
   */
  getUtcDateTime(from: string | Date): LuxonDateTime {
    if (typeof from == 'object') {
      return LuxonDateTime.fromJSDate(from).setZone('utc');
    }
    return LuxonDateTime.fromISO(from).setZone('utc');
  }
}

const dateTime = new DateTime();
export default dateTime;
