import { ToolingInterface } from '../../drivers/instrumentedResource.js';
import { Filter, FilterCtor } from './index.js';

export default class FilterBool implements Filter, FilterCtor {
  private yes: boolean;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.yes = config;
      resolve(this);
    });
  }
  matches(_resource: ToolingInterface): boolean {
    return this.yes;
  }
}
