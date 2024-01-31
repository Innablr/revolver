import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterTag implements Filter, FilterCtor {
  private tagName: string;
  private tagValue: string;
  private tagContains: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.tagName = config['name'];
      this.tagValue = config['value'];
      this.tagContains = config['contains'];
      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    const t = resource.tag(this.tagName);
    if (this.tagValue !== undefined) return t === this.tagValue;
    if (this.tagContains !== undefined && t !== undefined) return t.toLowerCase().includes(this.tagContains.toLowerCase());
    return false;
  }
}
