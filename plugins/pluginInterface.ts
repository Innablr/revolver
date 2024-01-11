import { Logger } from 'tslog';
import logger from '../lib/logger';

export abstract class RevolverPlugin {
  protected accountConfig: any;
  protected accountId: string;
  protected pluginConfig: any;
  protected logger: Logger<any>;
  protected supportedResources: string[];

  constructor(accountConfig: any, pluginName: string, pluginConfig: any) {
    this.accountConfig = accountConfig.settings;
    this.accountId = accountConfig.Id;
    this.pluginConfig = pluginConfig;
    this.pluginConfig.name = pluginName;
    this.logger = logger.getSubLogger({ name: this.accountConfig.name });
    this.logger.debug(`Initialising plugin ${this.name} for account ${this.accountConfig.name}`);
  }

  get name(): string {
    return this.pluginConfig.name;
  }

  initialise() {
    this.logger.info(`Plugin ${this.name} is initialising...`);
    return Promise.resolve(this);
  }

  isApplicable(resource: any) {
    return this.supportedResources.find((xs) => xs === resource.resourceType) !== undefined;
  }

  abstract generateActions(resource: any): Promise<any>;
}
