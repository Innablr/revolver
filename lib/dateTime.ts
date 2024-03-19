import { DateTime as LuxonDateTime } from 'luxon';
import { logger } from './logger';

/**
 * A class for using a consistent time during execution of a cycle of Revolver.
 */
class DateTime {
  private currentTime: LuxonDateTime;

  freezeTime(t: string) {
    this.currentTime = LuxonDateTime.fromISO(t).toUTC();
    if (this.currentTime.invalidReason) {
      logger.warn(`Invalid time freezeTime(${t}): ${this.currentTime.invalidReason}: ${this.currentTime.invalidExplanation}`);
    } else {
      logger.debug(`Freezing time: ${this.currentTime}`);
    }
  }

  freezeTimeUnix(t: string) {
    this.currentTime = LuxonDateTime.fromMillis(parseInt(t)).toUTC();
    if (this.currentTime.invalidReason) {
      logger.warn(`Invalid time freezeTimeUnix(${t}): ${this.currentTime.invalidReason}: ${this.currentTime.invalidExplanation}`);
    } else {
      logger.debug(`Freezing time: ${this.currentTime}`);
    }
  }

  getTime(tz?: string) {
    if (tz) {
      return this.currentTime.setZone(tz);
    }
    return this.currentTime;
  }
}

const dateTime = new DateTime();
export default dateTime;
