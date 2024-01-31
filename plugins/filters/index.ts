import { ToolingInterface } from '../../drivers/instrumentedResource';
import path from 'node:path';

export interface Filter {
  /**
   * Return true if a resource matches this filter
   * @param resource
   */
  matches(resource: ToolingInterface): boolean;
}

export interface FilterCtor {
  /**
   * Since the filters are loaded dynamically, an extra method is needed to track the
   * asynchronous status of the constructor.
   */
  ready(): Promise<Filter>;
}

/*
  Don't use this for anything other than tests
  Bundler needs to see a `require` with a literal string somewhere to work correctly
 */
export async function buildFilter(config: any): Promise<Filter> {
  const key = Object.keys(config)[0];
  const i = await import(path.join(__dirname, key));
  return new i.default(config[key]).ready();
}
