import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import type { RavelryClient } from '../ravelry/client.ts';
import { nonEmpty, shopUrl } from './format.ts';
import { VIEW_META } from '../view.ts';

const inputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .describe('Shop name or city, e.g. "London" or "Loop".'),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radius: z
      .number()
      .positive()
      .max(500)
      .default(25)
      .describe('Search radius around latitude/longitude.'),
    units: z.enum(['km', 'miles']).default('km'),
    page: z.number().int().min(1).default(1).describe('1-based results page.'),
    page_size: z.number().int().min(1).max(50).default(20).describe('Results per page (max 50).'),
  })
  .refine(input => (input.latitude === undefined) === (input.longitude === undefined), {
    message: 'Provide latitude and longitude together',
    path: ['latitude'],
  })
  .refine(input => input.query !== undefined || input.latitude !== undefined, {
    message: 'Provide a query, or latitude and longitude',
    path: ['query'],
  });

const outputSchema = z.object({
  shops: z.array(
    z.object({
      name: z.string(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      country: z.string().nullable(),
      distance: z.number().nullable().describe('Distance from the given point, in `units`.'),
      phone: z.string().nullable(),
      website: z.string().nullable(),
      email: z.string().nullable(),
      ravelry_url: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
    }),
  ),
  units: z.string(),
  page: z.number(),
  page_count: z.number(),
  total_results: z.number(),
});

export function registerFindYarnShops(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'find_yarn_shops',
    {
      title: 'Find yarn shops',
      description:
        "Find local yarn shops from Ravelry's shop directory, either around a point " +
        '(latitude/longitude + radius, nearest first) or by shop name or city. For "near me" ' +
        'or "in <city>", prefer coordinates: use the coordinates of the place the user names.',
      inputSchema,
      outputSchema,
      _meta: VIEW_META,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input, ctx) => {
      const byLocation = input.latitude !== undefined && input.longitude !== undefined;
      const response = await ravelry.searchShops(
        {
          query: input.query,
          lat: input.latitude,
          lng: input.longitude,
          radius: byLocation ? input.radius : undefined,
          units: byLocation ? input.units : undefined,
          page: input.page,
          page_size: input.page_size,
        },
        ctx.mcpReq.signal,
      );

      const output: z.infer<typeof outputSchema> = {
        shops: response.shops
          .filter(shop => !shop.closed)
          .map(shop => ({
            name: shop.name.trim(),
            address: nonEmpty(shop.location),
            city: nonEmpty(shop.city),
            country: shop.country?.name ?? null,
            distance: shop.distance == null ? null : Math.round(shop.distance * 10) / 10,
            phone: nonEmpty(shop.phone),
            website: nonEmpty(shop.url),
            email: nonEmpty(shop.shop_email),
            ravelry_url: shopUrl(shop.permalink),
            latitude: shop.latitude ?? null,
            longitude: shop.longitude ?? null,
          })),
        units: input.units,
        page: response.paginator.page,
        page_count: response.paginator.page_count,
        total_results: response.paginator.results,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}
