import { Moment, utc } from 'moment-timezone';
import { logger } from './logger';

class DateTime {
  private currentTime: Moment;

  freezeTime(t: string) {
    this.currentTime = utc(t);
    logger.debug('Freezing time: %s', this.currentTime);
  }

  getTime(tz?: string) {
    if (tz) {
      return this.currentTime.clone().tz(tz);
    }
    return this.currentTime.clone();
  }
}

const dateTime = new DateTime();
export default dateTime;
