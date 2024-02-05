import { z } from "zod";


// Used for defaults, and a partial used for org/account overrides
const Settings = z.object({
    region: z.string().optional(),
    timezone: z.string().default('utc'),
    timezoneTag: z.string().default('Timezone'),
    organizationRoleName: z.string(),
    revolverRoleName: z.string(),
    saveResources: z.string(),
    audit: z.object({
        console: z.boolean().optional(),
        csv: z.object({
            file: z.string(),
            append: z.boolean().default(false),
        }).optional()
    })
});

export default z.object({
    defaults: z.object({
        settings: Settings,
        drivers: z.array(
            z.object({
                name: z.string(),
                active: z.boolean().default(true),
                pretend: z.boolean().default(false)
            }),
        ).default([]),
        plugins: z.object({
            powercycle: z.object({
                active: z.boolean(),
                configs: z.tuple([
                    z.object({
                        tagging: z.string().default('strict'),
                        availabilityTag: z.string().default('Schedule')
                    }),
                ]),
            }).optional(),
            validateTags: z.object({
                active: z.boolean(),
                configs: z.array(
                    z.object({
                        tag: z.string(),
                        tagMissing: z.array(
                            z.union([z.string(), z.object({ setDefault: z.string() })])
                        ),
                        onlyResourceTypes: z.array(z.string()),
                        tagNotMatch: z.array(z.any()),
                    }),
                ),
            }).optional(),
        }),
    }),

    organizations: z.array(
        z.object({
            accountId: z.number().int(),
            settings: z.object({name: z.string()}).merge(Settings.partial()),
        })
    ).default([]),

    accounts: z.object({
        includeList: z.array(
            z.object({
                accountId: z.number().int(),
                settings: z.object({name: z.string()}).merge(Settings.partial()),
            }),
        ).default([]),
        excludeList: z.array(
            z.object({
                accountId: z.number().int(),
                settings: z.object({ name: z.string() }),
            }),
        ).default([]),
    }),
});
