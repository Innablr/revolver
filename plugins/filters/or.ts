import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor, initializeFilter } from './index';

export default class FilterOr implements Filter, FilterCtor {
  private elements: Filter[];

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      Promise.all(
        config.map(async (elem: any): Promise<Filter> => {
          return await initializeFilter(elem);
        }),
      ).then((results) => {
        this.elements = results;
        resolve(this);
      });
    });
  }

  matches(resource: ToolingInterface): boolean {
    return this.elements.reduce<boolean>((a: boolean, b: Filter): boolean => {
      return a || b.matches(resource);
    }, false);
  }
}
