import { DateTime as LuxonDateTime } from 'luxon';
import { logger } from './logger';

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
}

const dateTime = new DateTime();
export default dateTime;
