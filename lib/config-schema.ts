import { z } from "zod";

export default z.object({
    defaults: z.object({
        settings: z.object({
            region: z.string().optional(),
            timezone: z.string(),
            timezoneTag: z.string().default('Timezone'),
            organizationRoleName: z.string(),
            revolverRoleName: z.string(),
            saveResources: z.string(),
        }),
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
                        tagging: z.string(),
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
            settings: z.object({ region: z.string(), name: z.string() }),
        })
    ).default([]),

    accounts: z.object({
        includeList: z.array(
            z.object({
                accountId: z.string(),
                settings: z.object({ name: z.string() }),
            }),
        ).default([]),
        excludeList: z.array(
            z.object({
                accountId: z.string(),
                settings: z.object({ name: z.string() }),
            }),
        ).default([]),
    }),
});
