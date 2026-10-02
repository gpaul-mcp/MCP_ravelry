import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { attributeName, PATTERN_ATTRIBUTES, resolveAttribute } from '../ravelry/attributes.ts';
import type { ApiPattern, ApiPatternListItem } from '../ravelry/types.ts';
import { resolveCategory, weightPermalink } from '../ravelry/vocabulary.ts';
import { categoryPath, nonEmpty, range, rounded } from '../tools/format.ts';
import { patternSummarySchema, toPatternSummary } from '../tools/search-patterns.ts';
import { VIEW_META } from '../view.ts';
import type { UserContext } from './context.ts';
import {
  count,
  getPatternsInBatches,
  isFinished,
  loadFavoritePatterns,
  loadProjects,
  loadQueue,
} from './data.ts';
import { estimateLevel } from './insights.ts';

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

/** Techniques worth learning, easiest first within each craft (Ravelry attribute permalinks). */
const SKILLS: { permalink: string; craft: 'knitting' | 'crochet'; tier: 1 | 2 | 3 }[] = [
  { permalink: 'in-the-round', craft: 'knitting', tier: 1 },
  { permalink: 'stripes-colorwork', craft: 'knitting', tier: 1 },
  { permalink: 'icord', craft: 'knitting', tier: 1 },
  { permalink: 'top-down', craft: 'knitting', tier: 1 },
  { permalink: 'buttonholes', craft: 'knitting', tier: 1 },
  { permalink: 'cables', craft: 'knitting', tier: 2 },
  { permalink: 'lace', craft: 'knitting', tier: 2 },
  { permalink: 'short-rows', craft: 'knitting', tier: 2 },
  { permalink: 'raglan-sleeve', craft: 'knitting', tier: 2 },
  { permalink: 'circular-yoke', craft: 'knitting', tier: 2 },
  { permalink: 'heel-flap', craft: 'knitting', tier: 2 },
  { permalink: 'toe-up', craft: 'knitting', tier: 2 },
  { permalink: 'kitchener', craft: 'knitting', tier: 2 },
  { permalink: 'provisional', craft: 'knitting', tier: 2 },
  { permalink: 'mosaic', craft: 'knitting', tier: 2 },
  { permalink: 'twisted-stitches', craft: 'knitting', tier: 2 },
  { permalink: 'stranded', craft: 'knitting', tier: 2 },
  { permalink: 'set-in-sleeve', craft: 'knitting', tier: 3 },
  { permalink: 'brioche-tuck', craft: 'knitting', tier: 3 },
  { permalink: 'Intarsia', craft: 'knitting', tier: 3 },
  { permalink: 'steeks', craft: 'knitting', tier: 3 },
  { permalink: 'doubleknit', craft: 'knitting', tier: 3 },
  { permalink: 'entrelac', craft: 'knitting', tier: 3 },
  { permalink: 'granny-square', craft: 'crochet', tier: 1 },
  { permalink: 'amigurumi', craft: 'crochet', tier: 1 },
  { permalink: 'stripes-colorwork', craft: 'crochet', tier: 1 },
  { permalink: 'post-stitch', craft: 'crochet', tier: 2 },
  { permalink: 'motifs', craft: 'crochet', tier: 2 },
  { permalink: 'tapestry-crochet', craft: 'crochet', tier: 2 },
  { permalink: 'filet-crochet', craft: 'crochet', tier: 2 },
  { permalink: 'mosaic', craft: 'crochet', tier: 2 },
  { permalink: 'tunisian', craft: 'crochet', tier: 3 },
  { permalink: 'pineapple', craft: 'crochet', tier: 3 },
  { permalink: 'irish-crochet', craft: 'crochet', tier: 3 },
  { permalink: 'broomstick', craft: 'crochet', tier: 3 },
];

/** Attributes that say how a pattern is presented, not what it looks like. */
const NOT_STYLE = new Set(
  PATTERN_ATTRIBUTES.filter(a => a.group === 'instructions' || a.group === 'accessibility')
    .map(a => a.permalink)
    .concat([
      'in-the-round',
      'worked-flat',
      'seamless',
      'seamed',
      'one-piece',
      'sleeves',
      'long-sleeve',
    ]),
);

interface Profile {
  crafts: string[];
  level: string;
  average_difficulty: number | null;
  favourite_styles: { name: string; count: number }[];
  favourite_categories: { name: string; count: number }[];
  favourite_designers: { name: string; count: number }[];
  favourite_weights: { name: string; count: number }[];
  skills_used: string[];
  skills_to_try: string[];
}

export function registerStyleTools(server: McpServer, user: UserContext): void {
  server.registerTool(
    'discover_patterns_for_me',
    {
      title: 'Patterns picked for me',
      description:
        "Finds new patterns from the signed-in user's own taste and skills. Builds a style " +
        'profile from their favorites and projects (techniques, categories, designers, yarn ' +
        'weights, skills they have used). goal "more_like_my_favorites" searches around that ' +
        'style; "learn_a_skill" finds approachable patterns for a technique they have not used ' +
        'yet (or the one given). Patterns they already favorited, queued or made are left out.',
      inputSchema: z.object({
        goal: z.enum(['more_like_my_favorites', 'learn_a_skill']),
        skill: z
          .string()
          .trim()
          .min(2)
          .max(50)
          .optional()
          .describe('Technique to learn, e.g. "cables", "brioche", "toe up", "tunisian".'),
        category: z.string().trim().min(2).max(50).optional().describe('e.g. "hat", "cardigan".'),
        craft: z.enum(['knitting', 'crochet']).optional(),
        availability: z.enum(['free', 'ravelry', 'any']).default('any'),
        limit: z.number().int().min(1).max(15).default(8),
      }),
      outputSchema: z.object({
        profile: z.object({
          crafts: z.array(z.string()),
          level: z.string(),
          average_difficulty: z.number().nullable(),
          favourite_styles: z.array(z.object({ name: z.string(), count: z.number() })),
          favourite_categories: z.array(z.object({ name: z.string(), count: z.number() })),
          favourite_designers: z.array(z.object({ name: z.string(), count: z.number() })),
          favourite_weights: z.array(z.object({ name: z.string(), count: z.number() })),
          skills_used: z.array(z.string()),
          skills_to_try: z.array(z.string()),
        }),
        goal: z.string(),
        skill: z.string().nullable(),
        patterns: z.array(
          patternSummarySchema.extend({
            difficulty: z.number().nullable(),
            why: z.string(),
          }),
        ),
      }),
      _meta: VIEW_META,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [favorites, projects, queue] = await Promise.all([
        loadFavoritePatterns(user, signal),
        loadProjects(user, signal),
        loadQueue(user, signal),
      ]);
      const finished = projects.filter(isFinished);
      const [favoritePatterns, madePatterns] = await Promise.all([
        getPatternsInBatches(
          user.publicRavelry,
          favorites.slice(0, 100).map(f => f.pattern_id),
          signal,
        ),
        getPatternsInBatches(
          user.publicRavelry,
          finished.slice(0, 60).flatMap(p => (p.pattern_id ? [p.pattern_id] : [])),
          signal,
        ),
      ]);
      const profile = buildProfile(
        projects.map(p => p.craft_name),
        favoritePatterns,
        madePatterns,
        finished.length,
      );
      const known = new Set<number>([
        ...favorites.map(f => f.pattern_id),
        ...queue.flatMap(q => (q.pattern_id ? [Number(q.pattern_id)] : [])),
        ...projects.flatMap(p => (p.pattern_id ? [p.pattern_id] : [])),
      ]);
      const craft =
        input.craft ??
        (profile.crafts[0]?.toLowerCase() === 'crochet'
          ? 'crochet'
          : profile.crafts.length
            ? 'knitting'
            : undefined);
      const category = input.category
        ? resolveCategory(input.category, await user.publicRavelry.getPatternCategories(signal))
        : undefined;
      const availability = input.availability === 'any' ? undefined : input.availability;

      interface Search {
        params: Record<string, string | number | undefined>;
        why: string;
      }
      const searches: Search[] = [];
      let skill: string | null = null;

      if (input.goal === 'learn_a_skill') {
        const attribute = input.skill
          ? resolveAttribute(input.skill)
          : resolveAttribute(profile.skills_to_try[0] ?? 'cables');
        skill = attribute.name;
        const level = Math.round(profile.average_difficulty ?? 2);
        const params = {
          pa: attribute.permalink,
          craft,
          availability,
          diff: range(undefined, Math.min(8, Math.max(3, level + 2))),
          sort: 'popularity',
          page_size: 30,
        };
        const topCategory = category ?? favoriteCategoryPermalink(favoritePatterns);
        if (topCategory) {
          searches.push({
            params: { ...params, pc: topCategory },
            why: `teaches ${attribute.name}, in a kind of piece you like`,
          });
        }
        searches.push({ params, why: `a well-loved, approachable way to learn ${attribute.name}` });
      } else {
        // Favorites say most about taste; what they made counts too.
        const liked = [...favoritePatterns, ...madePatterns];
        const styles = topStylePermalinks(liked);
        const topCategory = category ?? favoriteCategoryPermalink(liked);
        const designer =
          profile.favourite_designers[0]?.name ??
          count(madePatterns.map(p => p.pattern_author?.name)).find(d => d.count >= 2)?.name;
        const weight = weightPermalink(
          profile.favourite_weights[0]?.name ??
            count(madePatterns.map(p => p.yarn_weight?.name))[0]?.name,
        );
        const base = { craft, availability, sort: 'popularity', page_size: 30 };
        if (styles.length >= 2) {
          searches.push({
            params: { ...base, pc: topCategory, pa: styles.slice(0, 2).join('+') },
            why: `${styles.slice(0, 2).map(attributeName).join(' + ')}, like many of your favorites`,
          });
        }
        if (designer) {
          searches.push({
            params: { ...base, pc: category, designer },
            why: `by ${designer}, a designer you favorite often`,
          });
        }
        if (styles[0]) {
          searches.push({
            params: { ...base, pc: topCategory, pa: styles[0], weight },
            why: `${attributeName(styles[0])}${weight ? ` in ${weight}` : ''}, your usual style`,
          });
        }
        if (searches.length === 0) {
          searches.push({ params: { ...base, pc: category }, why: 'popular with makers like you' });
        }
      }

      const results = await Promise.all(
        searches.map(search =>
          user.publicRavelry
            .searchPatterns(search.params, signal)
            .then(response => response.patterns.map(pattern => ({ pattern, why: search.why })))
            .catch((error: unknown) => {
              if (signal.aborted) throw error;
              return [];
            }),
        ),
      );
      // Take turns between the searches so every angle is represented.
      const picks: { pattern: ApiPatternListItem; why: string }[] = [];
      const seen = new Set(known);
      for (let i = 0; picks.length < input.limit && results.some(list => list[i]); i++) {
        for (const list of results) {
          const item = list[i];
          if (!item || seen.has(item.pattern.id) || picks.length >= input.limit) continue;
          seen.add(item.pattern.id);
          picks.push(item);
        }
      }
      const details = new Map(
        (
          await getPatternsInBatches(
            user.publicRavelry,
            picks.map(p => p.pattern.id),
            signal,
          )
        ).map(p => [p.id, p]),
      );

      return json({
        profile,
        goal: input.goal,
        skill,
        patterns: picks.map(({ pattern, why }) => ({
          ...toPatternSummary(pattern),
          difficulty: rounded(nonEmpty(details.get(pattern.id)?.difficulty_average ?? null)),
          why,
        })),
      });
    },
  );
}

function buildProfile(
  crafts: readonly (string | null | undefined)[],
  favorites: readonly ApiPattern[],
  made: readonly ApiPattern[],
  finishedCount: number,
): Profile {
  const difficulties = made
    .map(p => p.difficulty_average)
    .filter((d): d is number => typeof d === 'number' && d > 0);
  const average = difficulties.length
    ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length
    : null;
  const hardest = difficulties.length ? Math.max(...difficulties) : null;
  const craftNames = count([...crafts]).map(c => c.name);

  const used = new Set(made.flatMap(p => (p.pattern_attributes ?? []).map(a => a.permalink)));
  const myCrafts = new Set(craftNames.map(c => c.toLowerCase()));
  const tierLimit = (average ?? 0) >= 4 ? 3 : (average ?? 0) >= 2.5 ? 2 : 1;
  const toTry = SKILLS.filter(
    skill =>
      !used.has(skill.permalink) &&
      (myCrafts.size === 0 || myCrafts.has(skill.craft)) &&
      skill.tier <= tierLimit + 1,
  ).sort((a, b) => a.tier - b.tier);

  return {
    crafts: craftNames,
    level: estimateLevel(finishedCount, average, hardest),
    average_difficulty: rounded(average),
    favourite_styles: count(
      favorites.flatMap(p =>
        (p.pattern_attributes ?? [])
          .filter(a => !NOT_STYLE.has(a.permalink))
          .map(a => attributeName(a.permalink)),
      ),
    ).slice(0, 8),
    favourite_categories: count(
      favorites.map(p => {
        const first = p.pattern_categories?.[0];
        return first ? categoryPath(first).split(' > ').slice(-1)[0] : undefined;
      }),
    ).slice(0, 6),
    favourite_designers: count(favorites.map(p => p.pattern_author?.name)).slice(0, 5),
    favourite_weights: count(favorites.map(p => p.yarn_weight?.name)).slice(0, 4),
    skills_used: SKILLS.filter(skill => used.has(skill.permalink)).map(skill =>
      attributeName(skill.permalink),
    ),
    skills_to_try: [...new Set(toTry.map(skill => attributeName(skill.permalink)))].slice(0, 6),
  };
}

function topStylePermalinks(favorites: readonly ApiPattern[]): string[] {
  return count(
    favorites.flatMap(p =>
      (p.pattern_attributes ?? [])
        .map(a => a.permalink)
        .filter(permalink => !NOT_STYLE.has(permalink)),
    ),
  )
    .filter(entry => entry.count >= 2)
    .map(entry => entry.name);
}

/** The most common leaf category among favorites, as a `pc` filter value. */
function favoriteCategoryPermalink(favorites: readonly ApiPattern[]): string | undefined {
  const leaves = count(favorites.map(p => p.pattern_categories?.[0]?.permalink));
  return leaves[0] && leaves[0].count >= 2 ? leaves[0].name : undefined;
}
