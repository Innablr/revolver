import { DateTime as LuxonDateTime } from 'luxon';
import { logger } from './logger';

class DateTime {
  private currentTime: LuxonDateTime;

  freezeTime(t: string) {
    this.currentTime = LuxonDateTime.fromISO(t).toUTC();
    logger.debug(`Freezing time: ${this.currentTime}`);
  }

  getTime(tz?: string) {
    if (tz) {
      return this.currentTime.setZone(tz);
    }
    return this.currentTime;
  }

  resolveFilename(filename?: string): string {
    // If filename contains any %xx tokens then escape the rest and use Luxon to resolve the tokens
    if (filename && filename.includes('%')) {
      const fmt = "'" + filename.replace(/%(\w+)/g, "'$1'") + "'";
      return this.getTime().toFormat(fmt);
    }
    return filename as string;
  }
}

const dateTime = new DateTime();
export default dateTime;
