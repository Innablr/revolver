import { ToolingInterface } from '../../drivers/instrumentedResource';
import { arrayToOr, Filter, FilterCtor } from "./index";

export default class FilterAccountId implements Filter, FilterCtor {
  static readonly FILTER_NAME = 'accountId';
  private accountId: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      if (Array.isArray(config)) {
        resolve(arrayToOr(FilterAccountId.FILTER_NAME, config));
      } else {
        this.accountId = config;
        resolve(this);
      }
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.accountId === this.accountId;
  }
}
