import { z } from 'zod/v4';

const AWSAccountId = z.string().regex(/^\d{12}$/, {
  error: 'AWS AccountID are 12 digits',
});

const AWSRegion = z
  .string()
  .regex(/^(af|il|ap|ca|eu|me|sa|us|cn|us-gov|us-iso|us-isob)-(central|(north|south)?(east|west)?)-\d{1}$/, {
    error: 'Invalid AWS Region',
  });

// https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
// https://stackoverflow.com/questions/50480924/regex-for-s3-bucket-name
const AWSBucketName = z
  .string()
  .regex(
    /(?!(^((2(5[0-5]|[0-4][0-9])|[01]?[0-9]{1,2})\.){3}(2(5[0-5]|[0-4][0-9])|[01]?[0-9]{1,2})$|^xn--|.+-s3alias$))^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
    {
      error: 'Invalid AWS Bucket Name',
    },
  );

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html
const AWSArn = z.string().regex(/^arn:.*$/, {
  error: 'Invalid AWS ARN',
});

const ShorthandFilter = z.string().regex(/^([^|]+)\|.*/);

const StringCompareOptions = z.object({
  equals: z.string().optional(),
  iequals: z.string().optional(),
  contains: z.string().optional(),
  startswith: z.string().optional(),
  endswith: z.string().optional(),
  regexp: z.string().optional(),
});

const BaseFilters = z.strictObject({
  id: z.union([z.array(z.string()), z.string()]).optional(),
  accountId: z.union([z.array(z.string()), z.string()]).optional(),
  region: z.union([z.array(z.string()), z.string()]).optional(),
  state: z.union([z.array(z.string()), z.string()]).optional(),
  type: z.union([z.array(z.string()), z.string()]).optional(),
  name: z.union([z.array(z.string()), z.string()]).optional(),
  bool: z.boolean().optional(), // TODO: what is this?
  tag: z
    .union([
      z.array(ShorthandFilter),
      ShorthandFilter,
      z
        .strictObject({
          name: z.string(),
        })
        .extend(StringCompareOptions.shape),
    ])
    .optional(),
  resource: z
    .union([
      z.array(ShorthandFilter),
      ShorthandFilter,
      z
        .strictObject({
          path: z.string(),
        })
        .extend(StringCompareOptions.shape),
    ])
    .optional(),
  matchWindow: z
    .strictObject({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
});

// meta filters are recursive, need this to allow parsing to occur properly
type FilterT = z.infer<typeof BaseFilters> & {
  not?: FilterT;
  or?: FilterT[];
  and?: FilterT[];
};

const Filters: z.ZodType<FilterT> = BaseFilters.extend({
  not: z.lazy(() => Filters).optional(),
  or: z.lazy(() => Filters.array()).optional(),
  and: z.lazy(() => Filters.array()).optional(),
}).strict();

const ObjectLogOptions = z.object({
  file: z.string().optional(),
  sqs: z
    .object({
      url: z.url(),
      compress: z.boolean().prefault(true),
      attributes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  sns: z
    .object({
      url: AWSArn,
      compress: z.boolean().prefault(true),
      attributes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  s3: z
    .object({
      bucket: AWSBucketName,
      region: AWSRegion,
      path: z.string(),
    })
    .optional(),
});

const TimeZoneString = z.string().regex(/^([A-Za-z]+\/[A-Za-z_]+|UTC(?:[+-]\d+)?)$/, {
  error: 'Invalid Timezone',
});

const PowercycleCentralMatcher = z.object({
  name: z.string(),
  schedule: z.string(),
  priority: z.number().prefault(0),
  filter: z.union([z.array(Filters), Filters]),
  pretend: z.boolean().prefault(false),
});

// Used for defaults, and a partial used for org/account overrides
const Settings = z.object({
  region: AWSRegion.optional(),
  timezone: TimeZoneString, // .prefault('UTC'),
  timezoneTag: z.string().prefault('Timezone'),
  concurrency: z.number().prefault(0),
  organizationRoleName: z.string(),
  revolverRoleName: z.string(),
  resourceLog: z
    .object({
      json: z
        .object({
          overwrite: z.boolean().prefault(true),
        })
        .extend(ObjectLogOptions.shape)
        .optional(),
      html: ObjectLogOptions.optional(),
      csv: z
        .object({
          append: z.boolean().prefault(false),
          overwrite: z.boolean().prefault(true),
          reportTags: z.array(z.string()).optional(),
        })
        .extend(ObjectLogOptions.shape)
        .optional(),
      console: z
        .null()
        .or(
          z.object({
            reportTags: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  localResourcesFile: z.string().optional(),
  localOrgAccountsFile: z.string().optional(),
  localOrgAccountsWriteFile: z.string().optional(),
  auditLog: z
    .object({
      console: z.null().optional(),
      html: ObjectLogOptions.optional(),
      csv: z
        .object({
          append: z.boolean().prefault(false),
        })
        .extend(ObjectLogOptions.shape)
        .optional(),
      json: ObjectLogOptions.optional(),
    })
    .optional(),
  excludeResources: z.union([z.array(Filters), Filters]).optional(),
  includeResourceTags: z.array(z.string()).optional(), // if not specified, include all Tags
});

const ConfigSchema = z
  .object({
    defaults: z.object({
      settings: Settings,
      drivers: z
        .array(
          z.object({
            name: z.string(),
            active: z.boolean().prefault(true),
            pretend: z.boolean().prefault(false),
          }),
        )
        .prefault([]),
      plugins: z.strictObject({
        powercycle: z
          .strictObject({
            active: z.boolean(),
            configs: z.array(
              z.strictObject({
                tagging: z.string().prefault('strict'),
                availabilityTag: z.string().prefault('Schedule'),
              }),
            ),
          })
          .optional(),
        powercycleCentral: z
          .strictObject({
            active: z.boolean(),
            configs: z.array(
              z.strictObject({
                parser: z.string().prefault('strict'),
                availabilityTag: z.string().prefault('Schedule'),
                availabilityTagPriority: z.number().prefault(0),
                predefinedSchedules: z.record(z.string(), z.string()).prefault({}),
                matchers: z.array(PowercycleCentralMatcher),
              }),
            ),
          })
          .optional(),
        validateTags: z
          .strictObject({
            active: z.boolean(),
            configs: z.array(
              z.strictObject({
                tag: z.string(),
                tagMissing: z.array(z.union([z.string(), z.strictObject({ setDefault: z.string() })])),
                onlyResourceTypes: z.array(z.string()),
                tagNotMatch: z.array(z.any()),
              }),
            ),
          })
          .optional(),
      }),
    }),

    organizations: z
      .array(
        z.strictObject({
          accountId: AWSAccountId,
          accountNameRegex: z.string().optional(),
          settings: z.object({ name: z.string() }).extend(Settings.partial().shape),
        }),
      )
      .prefault([]),

    accounts: z.object({
      includeList: z
        .array(
          z.strictObject({
            accountId: AWSAccountId,
            settings: z.object({ name: z.string() }).extend(Settings.partial().shape),
          }),
        )
        .prefault([]),
      excludeList: z
        .array(
          z.strictObject({
            accountId: AWSAccountId,
            settings: z.strictObject({ name: z.string() }),
          }),
        )
        .prefault([]),
    }),
  })
  .transform((config) => {
    // copy .defaults.settings into .organizations[].settings
    config.organizations.forEach((org: any) => {
      org.settings = Object.assign({}, config.defaults.settings, org.settings);
    });
    // copy .defaults.settings into ..accounts.includeList[].settings
    config.accounts.includeList.forEach((account: any) => {
      account.settings = Object.assign({}, config.defaults.settings, account.settings);
    });
    return config;
  });

export { AWSRegion, ConfigSchema, Filters, PowercycleCentralMatcher, TimeZoneString };
