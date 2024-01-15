import { DateTime as LuxonDateTime } from 'luxon';
import { logger } from './logger';

class DateTime {
  private currentTime: LuxonDateTime;

  freezeTime(t: string) {
    this.currentTime = LuxonDateTime.fromISO(t).toUTC();
    logger.debug('Freezing time: %s', this.currentTime);
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
