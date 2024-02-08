# Contributing to Revolver

## Structure
Revolver works with a pluggable interface for `drivers` and `plugins` that are executed per cloud account.
* `drivers` implement cloud API calls, both query and update.
* `plugins` implement power cycling logic.

Main entry is `revolver.ts`, which determines what accounts it will run on.
For each account, Revolver does the following  (see `lib/accountRevolver.ts`):
* Obtain account authentication role.
* For each active driver, query the account for a list of resources.
* For each plugin, pass the discovered resources to generate a list of actions to perform.
* Pass actions to the drivers for execution.


## Workflow
Note: YAML and schema only need updating if adding/changing config.

* Add feature/fix bug
* Update schema in `lib/config-schema.ts`
* Update unit tests and the config YAML test: `npm run test`
* Update the bundle test YAML: `npm run bundleTest`
* Update example YAML
* Update README.md

## Setup

### Running
Create `revolver-config.yaml` in the root directory. Configure as necessary.
```sh
npm install
npm run build # or 'npm run watch' for a continuous build
npm run start
```

`start` utilizes `invoke.ts/js` to call the true `revolver.ts` with an event. This is necessary for local execution.

When developing revolver, it's useful to configure it to run entirely locally with the settings:
* `localResourcesJson: resources.json`
* `pretend: true`
* `revolverRoleName: none`

Generate the `resources.json` from a real execution once (using the setting `resourceLog.json`) and then run locally
for faster development feedback.


### Building
This will create a bundled js under `dist` and a complete zip under root as `revolver.zip`
```
npm run bundle
```


### Testing
Unit tests can be run with:
```
npm run test
```

Also, the bundle is sanity checked with the following command. This is used to validate the bundle runs successfully.
```
npm run bundleTest
```

## Adding a new Plugin
Plugins work by being passed a list of all specified supported resources discovered by the drivers and returning
a list of actions that need to be performed on those resources. They don't actually interact with any cloud APIs.

See `plugins/powercycle.ts` for an example.

To add a plugin:
* Extend `RevolverPlugin` from `plugins/pluginInterface.ts`. Important things to implement
  * `initialise(): Promise<PluginClass>`: Called by revolver during startup. Use for config parsing, setup, etc.
  * `generateActions(resource: any): Promise<any>`: Main plugin interface. Plugin needs to interpret all the resources
  passed and return a list of actions to perform on those resources.
  * `supportedResources`: List of `drivers` that this plugin supports.
* Add the plugin name to `supportedPlugins` in `lib/accountRevolver.ts`
* Update `lib/config-schema.ts` to support the new plugin.


## Adding a new Driver
rivers discover particular resources from the cloud and support specific actions on those resources.

See `drivers/ec2.ts` for an example.

To add a driver:
* Extend `ToolingInterface` from `drivers/instrumentedResource.ts`. This class will represent the driver's resource type
and isn't typically used outside the driver itself.
* Extend `DriverInterface` from `drivers/driverInterface.ts`. Implement:
  * `collect(): Promise<ToolingInterface[]>`: This should return a list of resources as defined from the newly implemented `ToolingInterface`
  * `resource(obj: InstrumentedResource): ToolingInterface`: This needs to translate an interface reference of
  `InstrumentedResource` to the concrete class that implements `ToolingInterface`
  * Implement supported actions. These are called by `DriverInterface.processActions` and work via looking for a method with
  the same string name as the action in `actions/actions.ts`. e.g. The `StartAction` uses the string `start` so to support
  this action add a method called `start()` to your `DriverInterface` subclass. The method is passed a list of resources
    (which should be typed according to your subclass of `ToolingInterface`) and the action itself.


## Adding a new Filter
Filters need to implement interfaces `Filter` and `FilterCtor` in `plugins/filters/index.ts`.
* `ready()` is a promise returning the filter itself to allow the constructor to use async. Filters will have `ready()` called
before being used.
* `matches(resource: ToolingInterface): boolean` performs the actual filtering logic on a resource.

Filters also need to support both value and array inputs and string comparison option settings. It's easier to simply copy
an existing filter and adjust unless you have a particularly complicated filter configuration.

1. Create new filter file under `plugins/filters`. Copy `accountId.ts` for a basic template or `tag.ts` for a filter with several options.
2. Update names in new file and change the implementation of `matches()` to support your filter logic.
3. Add tests to `test/filters/filters.spec.ts` to check the new filter. See existing tests for examples.
4. Update `BaseFilters` in `lib/config-schema.ts` to recognize the new filter.
5. Update `test/bundle-test-config.yaml` and the YAML in `test/config` to use the new filter. These don't need to be logical.
6. Update `README.md` filter table with the new filter and optionally add a reference in `revolver-config-example.yaml`
