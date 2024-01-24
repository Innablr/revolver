import { ToolingInterface } from '../../drivers/instrumentedResource';
import path from 'path';

export interface Filter {
  /**
   * Return true if a resource matches this filter
   * @param resource
   */
  matches(resource: ToolingInterface): boolean;

  /**
   * Since the filters are loaded dynamically, an extra method is needed to track the
   * asynchronous status of the constructor.
   */
  ready(): Promise<Filter>;
}

export async function initializeFilter(config: any): Promise<Filter> {
  const name = Object.keys(config)[0];
  const i = await import(path.join(__dirname, name));
  return new i.default(config[name]);
}
