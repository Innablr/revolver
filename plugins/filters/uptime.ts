import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import dateTime from '../../lib/dateTime.js';
import { arrayToOr, Filter, FilterCtor } from './index.js';

export default class FilterUptime implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'uptime';
  private minValue: number | undefined = undefined;
  private maxValue: number | undefined = undefined;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterUptime.FILTER_NAME, config));
      } else {
        // Simple parser for '<nnn' and '>nnn' and 'between nnn and nnn' strings
        const s = config.trim().toLowerCase();
        if (s.startsWith('<')) {
          this.maxValue = parseFloat(s.substring(1));
        } else if (s.startsWith('>')) {
          this.minValue = parseFloat(s.substring(1));
        } else {
          const matches = /between ([\d.]+) and ([\d.]+)/.exec(s);
          if (matches) {
            this.minValue = parseFloat(matches[1]);
            this.maxValue = parseFloat(matches[2]);
          } else {
            const matches = /([\d.]+)-([\d.]+)/.exec(s);
            if (matches) {
              this.minValue = parseFloat(matches[1]);
              this.maxValue = parseFloat(matches[2]);
            }
          }
        }
        // default undefined/undefined doesn't match anything
        resolve(this);
      }
    });
  }

  matches(resource: ToolingInterface): boolean {
    if (resource.resourceState !== 'running') {
      return false;
    }
    const uptime = dateTime.calculateUptime(resource.launchTimeUtc);
    if (this.minValue !== undefined && uptime < this.minValue) {
      return false;
    }
    if (this.maxValue !== undefined && uptime > this.maxValue) {
      return false;
    }
    if (this.minValue === undefined && this.maxValue === undefined) {
      return false;
    }
    return true;
  }
}
