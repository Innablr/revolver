import * as path from 'path';
const winston = require('winston');

export class AccountRevolver {
  readonly supportedDrivers = [
    'ec2',
    'ebs',
    'snapshot',
    'rdsInstance',
    'rdsMultiAz',
    'rdsMultiAzSnapshot',
    'rdsCluster',
    'rdsClusterSnapshot',
    'redshiftCluster',
    'redshiftClusterSnapshot',
  ];
  readonly supportedPlugins = ['powercycle', 'validateTags', 'restoreRdsSg'];

  readonly config;
  readonly logger;

  private plugins: any[];
  private drivers: any[];
  private resources: any[];

  constructor(accountConfig: any) {
    this.config = accountConfig;
    this.logger = winston.loggers.get(this.config.settings.name);
  }

  async initialise(): Promise<void> {
    this.logger.info('Initialising revolver');

    const activePlugins = Object.keys(this.config.plugins)
      .filter((xp) => this.supportedPlugins.indexOf(xp) > -1)
      .filter((xs) => this.config.plugins[xs].active);

    this.logger.info('Configuring plugins');
    this.plugins = await Promise.all(
      activePlugins.flatMap((xs: any) => {
        this.logger.info(`Configuring plugin ${xs}...`);
        return this.config.plugins[xs].configs.map(async (xp: any) => {
          const PluginModule = await import(path.join('..', 'plugins', xs));
          return new PluginModule(this.config, xs, xp);
        });
      }),
    );

    this.logger.info('Configuring drivers');
    this.drivers = await Promise.all(
      this.config.drivers
        .filter((xd: any) => this.supportedDrivers.indexOf(xd.name) > -1)
        .map(async (xd: any) => {
          const DriverModule = await import(path.join('..', 'drivers', xd.name));
          return new DriverModule(this.config, xd);
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
      await this.runPlugins();
      await this.runActions();
    } catch (err) {
      this.logger.error(`Error processing account ${this.config.settings.name}, stack trace will follow:`);
      this.logger.error(err);
    }
  }
}
