import { DriverInterface } from '../drivers/driverInterface';
import { ToolingInterface } from '../drivers/instrumentedResource';
import { RevolverPlugin } from '../plugins/pluginInterface';
import { logger } from './logger';
import { writeFileSync } from 'jsonfile';

export class AccountRevolver {
  readonly supportedDrivers = [
    'ec2',
    'ebs',
    'snapshot',
    'rdsInstance',
    'rdsCluster',
    'redshiftCluster',
    'redshiftClusterSnapshot',
    'local'
  ];
  readonly supportedPlugins = ['powercycle', 'validateTags', 'restoreRdsSg'];

  readonly config;
  readonly logger;

  private plugins: RevolverPlugin[];
  private drivers: DriverInterface[];
  private resources: ToolingInterface[];

  constructor(accountConfig: any) {
    this.config = accountConfig;
    this.logger = logger.getSubLogger(
      { name: 'accountRevolver' },
      { accountId: this.config.accountId, accountName: this.config.settings.name },
    );
  }

  async initialise(): Promise<void> {
    this.logger.info(`Initialising revolver for account ${this.config.settings.name}(${this.config.accountId})`);

    const activePlugins = Object.keys(this.config.plugins)
      .filter((xp) => this.supportedPlugins.indexOf(xp) > -1)
      .filter((xs) => this.config.plugins[xs].active);

    this.logger.info('Configuring plugins');
    this.plugins = await Promise.all(
      activePlugins.flatMap((xs: string) => {
        this.logger.info(`Configuring plugin ${xs}...`);
        return this.config.plugins[xs].configs.map(async (xp: any) => {
          const PluginModule = await require(`../plugins/${xs}`);
          return new PluginModule['default'](this.config, xs, xp);
        });
      }),
    );

    this.logger.info('Configuring drivers');
    this.drivers = await Promise.all(
      this.config.drivers
        .filter((xd: any) => this.supportedDrivers.indexOf(xd.name) > -1)
        .map(async (xd: any) => {
          this.logger.info(`Configuring driver ${xd.name}...`);
          const DriverModule = await require(`../drivers/${xd.name}`);
          return new DriverModule.default(this.config, xd);
        }),
    );

    this.logger.info('Initialising plugins and drivers');
    await Promise.all([
      Promise.all(this.plugins.map((plugin: any) => plugin.initialise())),
      Promise.all(this.drivers.map((driver: any) => driver.initialise())),
    ]);
  }

  async loadResources(): Promise<void> {
    this.logger.info('Loading resources');
    this.resources = (await Promise.all(this.drivers.map((xd) => xd.collect()))).flatMap((xr) => xr);
  }

  async saveResources(filename: string) {
    this.logger.info(`Writing resources to ${filename}`);
    writeFileSync(filename, this.resources, { spaces: 2 });
  }

  async runPlugins(): Promise<void> {
    this.logger.info('Plugins will process resources');
    await Promise.all(
      this.plugins.map((xp) =>
        Promise.all(this.resources.filter((xr) => xp.isApplicable(xr)).map((xr) => xp.generateActions(xr))),
      ),
    );
  }

  async runActions(): Promise<void> {
    this.logger.info('Drivers will run actions');
    await Promise.all(
      this.drivers.map((xd) => xd.processActions(this.resources.filter((xr) => xd.recogniseResource(xr)))),
    );
  }

  async revolve(): Promise<void> {
    try {
      await this.loadResources();
      if (this.config.settings.saveResources) {
        this.saveResources(this.config.settings.saveResources);
      }
      await this.runPlugins();
      await this.runActions();
    } catch (err) {
      this.logger.error(`Error processing account ${this.config.settings.name}, stack trace will follow:`);
      this.logger.error(err);
    }
  }
}
