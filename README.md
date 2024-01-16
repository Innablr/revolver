Revolver, an AWS powercycle facility and more
======

Why
------

Shutting AWS resources down when they are not in use is the first cost-saving exercise you should be thinking of.

The most commonly used pattern is tagging your resources with some sort of schedule and having a script run regularly parsing the tags and powercycling the resources.

Revolver does exactly that.

Revolver:
 * is run in AWS Lambda, send log in Cloudwatch Logs
 * is controlled by a YAML config file in S3 and a handful of environment variables
 * supports IAM cross-account access, so you can use one Lambda function to control multiple accounts
 * is fully asynchronous, which gives it a better performance
 * has a responsibilty separation between drivers that directly operate the resources and plugins that work out what needs to be done with a resource, which gives Revolver an amazing extensibility potential

Apart from powercycling resources Revolver can validate that required tags are set on AWS resources and their values match a regular expression.


What
------

Revolver currently supports the following AWS resources:
 * EC2 instances including those run in Autoscaling, Revolver will pause the ASG prior to shutting down instances
 * EBS volumes. Revolver will tag these resources. Revolver can get the tags from the parent instance/volume.
 * Snapshots. Revolver will tag these resources. Revolver can get the tags from the parent instance/volume.
 * RDS single instances, Revolver will use the native start/stop featur
 * RDS multi-az instances, Revolver will snapshot the instance and delete it. In the morning it will be restored from snapshot
 * RDS Clusters, Revolver will snapshot the cluster and save the critical information about the cluster members on the snapshot

Revolver does not support RDS instances with read replicas, as it is very difficult to ensure integrity for such configurations


How
------

### Deploy

This repository only contains the Revolver code and no deployment mechanisms. The make target `bundle` produces a zip-file
suitable for deployment in AWS Lambda. You can find an example Cloudformation template in the `examples/cloudformation` directory.

You can include this repository as a submodule into the Innablr Cloudformation deployment automation and deploy using `INSTALLATION_NAME=your_name RUNTIME_ENVIRONMENT=your_env R53_DOMAIN=your_domain make deploy`

For example, in Innablr environment it will be:
```bash
$ INSTALLATION_NAME=innablr0 RUNTIME_ENVIRONMENT=innablr R53_DOMAIN=innablr.lan AWS_DEFAULT_REGION=ap-southeast-2 make deploy
```

Example configuration file is in `examples/config`.

### Configure

Revolver configuration is done in YAML. First line in the config file must be `---` as per YAML specification.

1. Section `defaults` defines default behavior for all accounts. Settings in this section will be overriden in the accounts section

    | Option name | Description | Default |
    |-|-|-|
    | region | Specifies the default AWS region | - |
    | timezone | Specifies the default time zone | - |
    | timezone_tag | Revolver will read this tag on individual resources to override account-wide timezone | Timezone |
    | organization_role_name | Role to be assumed on the main account from organizations to get the accounts list from it | - |
    | revolver_role_name | Revolver role name to be assumed on each client account | - |
    | drivers | List of enabled drivers and their options (see Drivers) | - |
    | plugins | List of enabled plugins with their options (see Plugins) | - |

    Example `defaults` section:

    ```
    defaults:
      region: ap-southeast-2
      timezone: Australia/Melbourne
      timezone_tag: Timezone
      organization_role_name: AWSOrganizationsReadOnly
      revolver_role_name: ssPowerCycle
      drivers:
        - name: ec2
          pretend: false
          inspector_assessment_target: InspectorFull # optional
        - name: rdsInstance
          pretend: false
        - name: rdsMultiAz
          pretend: false
        - name: rdsMultiAzSnapshot
          pretend: false
        - name: rdsCluster
          pretend: false
        - name: rdsClusterSnapshot
          pretend: false
    ```

2. Section `organizations` specifies per-organization options overriding the defaults from the `defaults section`. __Please note that are no need to specify any settings here a part of the Id per organization if following the defaults section__

    Leave as empty array if not being used
    ```
    organizations: []
    ```

    Example organization configuration:
    ```
    organizations:
      - account_id: "A39001261645"
        settings:
          name: Innablr
          revolver_role_name: ssPowerCycle
          organization_role_name: AWSOrganizationsReadOnly
        drivers:
          - name: ec2
            inspector_assessment_target: AnotherInspectorName
            pretend: false
    ```

3. Section `accounts` have two lists `include_list` (specify individual accounts to run Revolver) and `exclude_list` (make sure Revolver won't run on these accounts) options overriding the defaults from the `defaults section`. __Please note that individual accounts added to include_list will have priority on the settings and will override the defaults from the `default section` AND the ones by organization on `organizations section`__

    Example account configuration:

    ```
    accounts:
      include_list:
        - account_id: "A50000000071"
          settings:
            name: radix-dev
            timezone: Australia/Melbourne
          plugins:
            - name: powercycle
              tagging: strict
              availability_tag: Schedule
            - name: restoreRdsSg
            - name: validateTags
              tag: CostCentre
      exclude_list:
        - account_id:
          settings:
            name: helix-dev
            timezone: Europe/Dublin
            timezone_tag: TZ
          plugins:
            - name: powercycle
              tagging: strict
              availability_tag: Availability
            - name: restoreRdsSg
            - name: validateTags
              tag: Owner
    ```

    Supported options are the same as `defaults`

#### Drivers

Drivers define how to operate with a particular AWS resource, how to stop or start it or retrieve a tag.

`drivers` section in the config file is a list of dicts, every dict represents an instance of a driver. Attribute `name` is the name of the driver.

All drivers support the following options:

|Option|Description|Allowed values|Default|
|-|-|-|-|
|pretend|Prevents the driver from actually performing the actions. Good for debugging|`true` or `false`|`true`|

Supported drivers:

|Driver|Description|
|-|-|
|ec2|AWS EC2 instances and autoscaling groups|
|rdsInstance|Standalone non-multiaz instances. Uses native RDS start/stop functionality|
|rdsMultiAz|Multi-AZ RDS instances. Also requires configured `rdsMultiAzSnapshot` driver to be able to start instances|
|rdsMultiAzSnapshot|Counterpart of `rdsMultiAz`. Restores snapshots created by rdsMultiAz|
|rdsCluster|RDS Aurora clusters. Requires `rdsClusterSnapshot` to restore clusters in the morning|
|rdsClusterSnapshot|Part of `rdsCluster`. Restores cluster snapshots|

##### ec2 driver

|Option|Description|Allowed values|Default|
|-|-|-|-|
|inspector_assessment_target|Name of the Inspector Assessment Target|Inspector Assessment Target name| InspectorFull |

EC2 Driver has an optional settings `inspector_assessment_target` that needs to be set if you want to use the plugin `inspectorAgent` plugin. The Inspector Assessment target if preferable a target under the AWS account that selects all instances running.


#### Plugins

Plugins define what needs to be done on AWS resources. Some plugins support only some types of AWS resources but not the others.

For every AWS resource plugins will be executed in the order they are listed in the config file. Plugins that run earlier will have the priority on the state-changing actions. For example if `validateTags` wants to shut an EC2 instance down and at the same time the `powercycle` plugin wants to start it, the plugin that is listed first wins.

##### powercycle plugin

Starts AWS resources in the worktime and stops them after hours based on their tagging. Supports pluggable tagging formats.

|Option|Description|Allowed values|Default|
|-|-|-|-|
|tagging|Defines tagging format. See below|`strict`|`strict`|
|availability_tag|Name of the tag that contains the schedule|AWS tag name|Schedule|

When an operation is performed on a resource a tag with a name `ReasonSchedule` (Schedule is replaced with the actual name of the schedule tag) will be set explaining the reason.

When the schedule tag is missing or unreadable a tag with a name `WarningSchedule` (Schedule is replaced with the actual name of the schedule tag) will be set with a warning text.

Powercycle respects the account-wide timezone specification as well as individual timezone tags on resources (see `defaults` and `accounts`).

```
plugins:
  - name: powercycle
    tagging: strict
    availability_tag: Schedule
```

Powercycle plugin supports the following tagging standards:

###### strict

Schedule is set as a string like `Start=8:00|mon-fri;Stop=16:30|mon-fri;Override=Off`. Start= specifies the startup time, Stop= is the stop time, both in 24h format.

Days are separated by the pipe symbol, must be a full range (`mon` or `-fri` is not supported) and can be either appended to Start or Stop but only the first seen definition will be used (`Start=x|mon-fri;Stop=y|tue-thu` will result in `mon-fri`).

If Start= or Stop= is omitted, the resource will be only brought up or down within 15 min range of the specified time. Useful for making sure that resources are always shut down in the end of the day but only brought up on-demand: `Stop=18:00|mon-fri`.

`Override=On/Off` is optional, if set to `Override=On` resource will be ignored by the plugin.

There is also special values for the schedule tag:
  * `24x7` - resource will be always up. If you stop it manually Revolver will attempt to bring it up
  * `24x5` - resource will be always up except for Saturday and Sunday
  * `0x7` - resource will be always down. If you manually start it Revolver will bring it down

For RDS `|` and `;` must be replaces with `_` and '/' respectively as RDS does not support these characters in tags: `Start=08:00_mon-sat/Stop=17:55/Override=off`.

##### restoreRdsSg

This is a sidekick plugin for `rdsMultiAzSnapshot`. When `rdsMultiAzSnapshot` restores the database from a snapshot the security groups on the database can only be set after the restore is fully complete. So Revolver will attempt setting the security groups on its subsequent runs by running the snapshot through this plugin.

This plugin requires no configuration.

```
plugins:
  - name: powercycle
    tagging: strict
    availability_tag: Schedule
  - name: restoreRdsSg
```

##### inspectorAgent plugin

This plugin will check an Inspector Assessment Target to get the agent status on all ec2 instances.

|Option|Description|Allowed values|Default|
|-|-|-|-|
|tag|Name of the tag to mark the agent status|Aws tag name| - |
|unhealthy_status|List of actions to perform on the resource if the Inspector scan have been failing|`warn`,`stop`| - |
|unknown_status|List of actions to perform on the resource if the Inspector agent is either not installed or never run on the instance|`warn`,`stop`| - |

##### ssmAgent plugin

This plugin will check if SSM Agent is not installed on all ec2 instances.

|Option|Description|Allowed values|Default|
|-|-|-|-|
|tag|Name of the tag to mark the agent status|Aws tag name| - |
|not_installed|List of actions to perform on the resource if the SSM Agent is not installed|`warn`,`stop`| - |

##### validateTags plugin

This plugin will validate that a certain tag exist on AWS resources and optionally match the provided regular expression. If the tag is missing or does not match, the resource can be optionally shut down and/or set a warning tag.

To validate several tags include this plugin in the configuration once for every tag.

|Option|Description|Allowed values|Default|
|-|-|-|-|
|tag|Name of the tag to validate|AWS tag name| - |
|match|JS-compatible regular expression to match the value against (optional)|JS regex| - |
|tag_missing|List of actions to perform on the resource if the tag is missing|`warn`,`stop`| - |
|tag_not_match|List of actions to perform on the resource if the tag does not match the regex in `match`|`warn`,`stop`| - |
|allow_set_from_parent|Allow Revolver to try to get tags from parent (instance/volumes) -- works only with ebs/snapshot drivers|`true`,`false`|`true`|

```
plugins:
  - name: validateTags
    tag: CostCentre
    match: PROJ\d{4}
    allow_set_from_parent: true
    tag_missing:
      - warn
      - stop
    tag_not_match:
      - warn
  - name: validateTags
    tag: OwnerDescription
    match: ^.*@.*$
    tag_missing:
      - warn
      - stop
    tag_not_match:
      - warn
```

You also can concatenate tags that will share the same settings on the same block

```
plugins:
  - name: validateTags
    tag: [ CostCentre, OwnerDescription, Service ]
    tag_missing:
      - warn
      - stop
    tag_not_match:
      - warn
```
