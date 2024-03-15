import { z } from 'zod';

const AWSAccountId = z.string().regex(/\d{12}/);

const ShorthandFilter = z.string().regex(/^([^|]+)\|.*/);

const StringCompareOptions = z.object({
  equals: z.string().optional(),
  iequals: z.string().optional(),
  contains: z.string().optional(),
  startswith: z.string().optional(),
  endswith: z.string().optional(),
  regexp: z.string().optional(),
});

const BaseFilters = z
  .object({
    id: z.union([z.array(z.string()), z.string()]).optional(),
    accountId: z.union([z.array(z.string()), z.string()]).optional(),
    region: z.union([z.array(z.string()), z.string()]).optional(),
    state: z.union([z.array(z.string()), z.string()]).optional(),
    type: z.union([z.array(z.string()), z.string()]).optional(),
    name: z.union([z.array(z.string()), z.string()]).optional(),
    bool: z.boolean().optional(),
    tag: z
      .union([
        z.array(ShorthandFilter),
        ShorthandFilter,
        z
          .object({
            name: z.string(),
          })
          .merge(StringCompareOptions)
          .strict(),
      ])
      .optional(),
    resource: z
      .union([
        z.array(ShorthandFilter),
        ShorthandFilter,
        z
          .object({
            path: z.string(),
          })
          .merge(StringCompareOptions)
          .strict(),
      ])
      .optional(),
  })
  .strict();

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
      url: z.string(),
      attributes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  s3: z
    .object({
      bucket: z.string(),
      region: z.string(),
      path: z.string(),
    })
    .optional(),
});

// Used for defaults, and a partial used for org/account overrides
const Settings = z.object({
  region: z.string().optional(),
  timezone: z.string().default('utc'),
  timezoneTag: z.string().default('Timezone'),
  organizationRoleName: z.string(),
  revolverRoleName: z.string(),
  resourceLog: z
    .object({
      json: ObjectLogOptions.optional(),
      html: ObjectLogOptions.optional(),
      csv: z
        .object({
          reportTags: z.array(z.string()).optional(),
        })
        .merge(ObjectLogOptions)
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
          append: z.boolean().default(false),
        })
        .merge(ObjectLogOptions)
        .optional(),
      json: ObjectLogOptions.optional(),
    })
    .optional(),
  excludeResources: z.union([z.array(Filters), Filters]).optional(),
});

const ConfigSchema = z
  .object({
    defaults: z.object({
      settings: Settings,
      drivers: z
        .array(
          z.object({
            name: z.string(),
            active: z.boolean().default(true),
            pretend: z.boolean().default(false),
          }),
        )
        .default([]),
      plugins: z
        .object({
          powercycle: z
            .object({
              active: z.boolean(),
              configs: z.array(
                z.object({
                  tagging: z.string().default('strict'),
                  availabilityTag: z.string().default('Schedule'),
                }),
              ),
            })
            .optional(),
          powercycleCentral: z
            .object({
              active: z.boolean(),
              configs: z.array(
                z.object({
                  parser: z.string().default('strict'),
                  availabilityTag: z.string().default('Schedule'),
                  availabilityTagPriority: z.number().default(0),
                  predefinedSchedules: z.record(z.string(), z.string()).default({}),
                  matchers: z.array(
                    z.object({
                      name: z.string(),
                      schedule: z.string(),
                      priority: z.number().default(0),
                      filter: z.union([z.array(Filters), Filters]),
                    }),
                  ),
                }),
              ),
            })
            .optional(),
          validateTags: z
            .object({
              active: z.boolean(),
              configs: z.array(
                z.object({
                  tag: z.string(),
                  tagMissing: z.array(z.union([z.string(), z.object({ setDefault: z.string() })])),
                  onlyResourceTypes: z.array(z.string()),
                  tagNotMatch: z.array(z.any()),
                }),
              ),
            })
            .optional(),
        })
        .strict(),
    }),

    organizations: z
      .array(
        z
          .object({
            accountId: AWSAccountId,
            accountNameRegex: z.string().optional(),
            settings: z.object({ name: z.string() }).merge(Settings.partial()),
          })
          .strict(),
      )
      .default([]),

    accounts: z.object({
      includeList: z
        .array(
          z
            .object({
              accountId: AWSAccountId,
              settings: z.object({ name: z.string() }).merge(Settings.partial()),
            })
            .strict(),
        )
        .default([]),
      excludeList: z
        .array(
          z
            .object({
              accountId: AWSAccountId,
              settings: z.object({ name: z.string() }),
            })
            .strict(),
        )
        .default([]),
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

export { ConfigSchema };
