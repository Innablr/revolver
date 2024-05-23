import { ToolingInterface } from '../../drivers/instrumentedResource';
import dateTime from '../../lib/dateTime';
import { arrayToOr, Filter, FilterCtor, StringCompareOptions } from './index';
import { DateTime as LuxonDateTime } from 'luxon';

export default class FilterMatchWindowStart implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'match_window';
  // private compareOptions: StringCompareOptions;
  private startTime: LuxonDateTime | undefined;
  private endTime: LuxonDateTime | undefined;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterMatchWindowStart.FILTER_NAME, config));
      } else {
        // TODO: validate dates, emit error
        this.startTime = config.from ? LuxonDateTime.fromISO(config.from).toUTC() : undefined;
        this.endTime = config.to ? LuxonDateTime.fromISO(config.to).toUTC() : undefined;
        resolve(this);
      }
    });
  }
  matches(resource: ToolingInterface): boolean {
    const now = dateTime.getTime();
    if (this.startTime && now < this.startTime) {
      return false; // too early
    }
    if (this.endTime && now > this.endTime) {
      return false; // too late
    }
    return true;
  }
}
