import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

import './view.css';

// ---- Data shapes (the tools' structuredContent) ----

interface PatternSummary {
  id: number;
  name: string;
  url: string;
  free: boolean;
  designer: string | null;
  photo_url: string | null;
}

interface PatternDetails extends PatternSummary {
  craft: string | null;
  categories: string[];
  price: string | null;
  difficulty: number | null;
  rating: number | null;
  rating_count: number | null;
  projects_count: number | null;
  yarn_weight: string | null;
  yardage: string | null;
  gauge: string | null;
  needles_or_hooks: string[];
  sizes_available: string | null;
}

interface YarnSummary {
  id: number;
  name: string;
  company: string | null;
  url: string;
  weight: string | null;
  yards_per_skein: number | null;
  grams_per_skein: number | null;
  machine_washable: boolean | null;
  discontinued: boolean | null;
  rating: number | null;
  rating_count: number | null;
  photo_url: string | null;
  fibers?: string[];
  needles?: string | null;
  hooks?: string | null;
  gauge?: string | null;
  attributes?: string[];
  projects_using_it?: number;
  score?: number;
  reasons?: string[];
}

interface StashEntry {
  id: number;
  yarn: string;
  yarn_url: string | null;
  weight: string | null;
  colorway: string | null;
  skeins: number | null;
  yards: number | null;
  location: string | null;
}

type Data = Record<string, unknown>;

// ---- Tiny DOM helpers (textContent only: Ravelry data is never parsed as HTML) ----

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; onclick?: () => void; title?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.title) element.title = props.title;
  if (props.onclick) element.addEventListener('click', props.onclick);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

const chip = (text: string, tone = '') => h('span', { class: `chip ${tone}`.trim() }, text);

function photo(url: string | null | undefined, alt: string, emoji = '🧶'): HTMLElement {
  const box = h('div', { class: 'photo' });
  if (url && /^https:\/\/[\w.-]*ravelrycache\.com\//.test(url)) {
    const img = h('img');
    img.src = url;
    img.alt = alt;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.replaceWith(h('div', { class: 'placeholder' }, emoji));
    });
    box.append(img);
  } else {
    box.append(h('div', { class: 'placeholder' }, emoji));
  }
  return box;
}

function thumb(url: string | null | undefined, emoji = '🧶'): HTMLElement {
  const box = h('div', { class: 'thumb' });
  if (url && /^https:\/\/[\w.-]*ravelrycache\.com\//.test(url)) {
    const img = h('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    box.append(img);
  } else {
    box.append(emoji);
  }
  return box;
}

function details(pairs: [string, string | number | null | undefined][]): HTMLElement {
  const list = h('dl', { class: 'details' });
  for (const [label, value] of pairs) {
    if (value === null || value === undefined || value === '') continue;
    list.append(h('dt', {}, label), h('dd', {}, String(value)));
  }
  return list;
}

const titleCase = (text: string) =>
  text.replace(/(^|[-\s])\w/g, m => m.toUpperCase()).replace('-', ' ');

// ---- Host bridge ----

const app = new App({ name: 'Ravelry', version: '1.0.0' }, {}, { autoResize: true });
const root = document.getElementById('app') ?? document.body;

const open = (url: string) => {
  void app.openLink({ url });
};

const ask = (text: string) => {
  void app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
};

function linkButton(url: string, label = 'Ravelry ↗') {
  return h(
    'button',
    {
      onclick: () => {
        open(url);
      },
      title: url,
    },
    label,
  );
}

// ---- Patterns ----

function patternCard(pattern: PatternSummary): HTMLElement {
  const body = h(
    'div',
    { class: 'body' },
    h('div', { class: 'title' }, pattern.name),
    pattern.designer && h('div', { class: 'byline' }, `by ${pattern.designer}`),
  );
  const detailsButton = h('button', {}, 'Details');
  detailsButton.addEventListener('click', () => {
    detailsButton.disabled = true;
    detailsButton.textContent = '…';
    app
      .callServerTool({ name: 'get_pattern_details', arguments: { ids: [pattern.id] } })
      .then(result => {
        const full = (result.structuredContent as { patterns?: PatternDetails[] } | undefined)
          ?.patterns?.[0];
        detailsButton.remove();
        if (full) body.insertBefore(patternFacts(full), actions);
      })
      .catch(() => {
        detailsButton.disabled = false;
        detailsButton.textContent = 'Details';
      });
  });
  const actions = h(
    'div',
    { class: 'actions' },
    linkButton(pattern.url),
    detailsButton,
    h(
      'button',
      {
        onclick: () => {
          ask(`Which yarns could I use for "${pattern.name}" (Ravelry pattern ${pattern.id})?`);
        },
      },
      'Yarn ideas',
    ),
    h(
      'button',
      {
        class: 'primary',
        onclick: () => {
          ask(`Add "${pattern.name}" (Ravelry pattern ${pattern.id}) to my Ravelry queue.`);
        },
      },
      'Queue it',
    ),
  );
  body.append(actions);

  const card = h('div', { class: 'card' }, photo(pattern.photo_url, pattern.name, '🧶'), body);
  card
    .querySelector('.photo')
    ?.append(
      h(
        'span',
        { class: 'ribbon' },
        chip(pattern.free ? 'Free' : 'Paid', pattern.free ? 'good' : 'accent'),
      ),
    );
  return card;
}

function patternFacts(pattern: PatternDetails): HTMLElement {
  return details([
    ['Yarn', pattern.yarn_weight],
    ['Yardage', pattern.yardage],
    ['Gauge', pattern.gauge],
    ['Needles', pattern.needles_or_hooks.join(', ')],
    ['Sizes', pattern.sizes_available],
    ['Difficulty', pattern.difficulty ? `${pattern.difficulty} / 10` : null],
    ['Rating', pattern.rating ? `★ ${pattern.rating} (${pattern.rating_count ?? 0})` : null],
    ['Projects', pattern.projects_count?.toLocaleString()],
    ['Price', pattern.price],
  ]);
}

function renderPatternSearch(data: Data) {
  const patterns = (data.patterns ?? []) as PatternSummary[];
  const total = Number(data.total_results ?? patterns.length);
  return [
    h(
      'h2',
      {},
      'Patterns',
      h(
        'span',
        { class: 'sub' },
        `${total.toLocaleString()} matches${typeof data.category === 'string' ? ` · ${data.category}` : ''}`,
      ),
    ),
    patterns.length
      ? h('div', { class: 'grid' }, ...patterns.map(patternCard))
      : h('p', { class: 'empty' }, 'No patterns matched.'),
    Number(data.page_count ?? 1) > Number(data.page ?? 1) &&
      h(
        'div',
        { class: 'more' },
        h(
          'button',
          {
            onclick: () => {
              ask('Show me the next page of those patterns.');
            },
          },
          'More patterns',
        ),
      ),
  ];
}

function renderPatternDetails(data: Data) {
  const patterns = (data.patterns ?? []) as PatternDetails[];
  return [
    h(
      'h2',
      {},
      patterns.length === 1 ? (patterns[0]?.name ?? 'Pattern') : `${patterns.length} patterns`,
    ),
    h(
      'div',
      { class: 'grid' },
      ...patterns.map(pattern => {
        const card = patternCard(pattern);
        card.querySelector('.actions button:nth-child(2)')?.remove();
        card.querySelector('.actions')?.before(patternFacts(pattern));
        if (pattern.categories[0])
          card
            .querySelector('.byline')
            ?.after(h('div', { class: 'chips' }, chip(pattern.categories[0])));
        return card;
      }),
    ),
  ];
}

// ---- Yarns ----

function yarnChips(yarn: YarnSummary): HTMLElement {
  return h(
    'div',
    { class: 'chips' },
    yarn.weight && chip(yarn.weight, 'accent'),
    yarn.yards_per_skein
      ? chip(
          `${yarn.yards_per_skein} yd${yarn.grams_per_skein ? ` / ${yarn.grams_per_skein} g` : ''}`,
        )
      : null,
    yarn.machine_washable && chip('Machine wash'),
    yarn.rating ? chip(`★ ${yarn.rating}`) : null,
    yarn.discontinued && chip('Discontinued', 'bad'),
  );
}

function yarnCard(yarn: YarnSummary, extra?: Child): HTMLElement {
  const body = h(
    'div',
    { class: 'body' },
    h('div', { class: 'title' }, yarn.name),
    yarn.company && h('div', { class: 'byline' }, yarn.company),
    yarnChips(yarn),
    extra,
  );
  if (yarn.fibers?.length || yarn.needles) {
    body.append(
      details([
        ['Fiber', yarn.fibers?.join(', ')],
        ['Needles', yarn.needles],
        ['Hooks', yarn.hooks],
        ['Gauge', yarn.gauge],
      ]),
    );
  }
  const detailsButton = !yarn.fibers && h('button', {}, 'Details');
  if (detailsButton) {
    detailsButton.addEventListener('click', () => {
      detailsButton.disabled = true;
      app
        .callServerTool({ name: 'get_yarn_details', arguments: { ids: [yarn.id] } })
        .then(result => {
          const full = (result.structuredContent as { yarns?: YarnSummary[] } | undefined)
            ?.yarns?.[0];
          detailsButton.remove();
          if (full) {
            body.insertBefore(
              details([
                ['Fiber', full.fibers?.join(', ')],
                ['Needles', full.needles],
                ['Hooks', full.hooks],
                ['Gauge', full.gauge],
                ['Care', full.attributes?.filter(a => /wash|dry/i.test(a)).join(', ')],
              ]),
              actions,
            );
          }
        })
        .catch(() => {
          detailsButton.disabled = false;
        });
    });
  }
  const actions = h(
    'div',
    { class: 'actions' },
    linkButton(yarn.url),
    detailsButton,
    h(
      'button',
      {
        onclick: () => {
          ask(
            `Find patterns that would work with ${[yarn.company, yarn.name].filter(Boolean).join(' ')} (Ravelry yarn ${yarn.id}).`,
          );
        },
      },
      'Patterns',
    ),
  );
  body.append(actions);
  return h('div', { class: 'card' }, photo(yarn.photo_url, yarn.name, '🧶'), body);
}

function renderYarns(data: Data, heading = 'Yarns') {
  const yarns = (data.yarns ?? []) as YarnSummary[];
  const total = data.total_results !== undefined ? Number(data.total_results) : yarns.length;
  return [
    h(
      'h2',
      {},
      heading,
      h('span', { class: 'sub' }, `${total.toLocaleString()} ${total === 1 ? 'yarn' : 'yarns'}`),
    ),
    yarns.length
      ? h('div', { class: 'grid' }, ...yarns.map(y => yarnCard(y)))
      : h('p', { class: 'empty' }, 'No yarns matched.'),
  ];
}

function renderSubstitutes(data: Data) {
  const pattern = data.pattern as {
    name: string;
    url: string;
    yarn_weight: string | null;
    yardage: string | null;
    gauge: string | null;
    designer_suggested_yarns: string[];
  };
  const yarns = (data.yarns ?? []) as YarnSummary[];
  return [
    h(
      'h2',
      {},
      `Yarns for ${pattern.name}`,
      h(
        'span',
        { class: 'sub' },
        `${Number(data.total_yarns_used).toLocaleString()} yarns used by makers`,
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'div',
        { class: 'main' },
        h('div', { class: 'title' }, 'The pattern calls for'),
        details([
          ['Weight', pattern.yarn_weight],
          ['Yardage', pattern.yardage],
          ['Gauge', pattern.gauge],
          ['Designer used', pattern.designer_suggested_yarns.join(', ')],
        ]),
      ),
      linkButton(pattern.url),
    ),
    h('h3', {}, 'Most used by other makers'),
    h(
      'div',
      { class: 'grid' },
      ...yarns.map(yarn =>
        yarnCard(yarn, chip(`Used in ${yarn.projects_using_it ?? 0} projects`, 'good')),
      ),
    ),
  ];
}

function renderMatches(data: Data) {
  const matches = (data.matches ?? []) as {
    label: string;
    confidence: 'high' | 'medium' | 'low' | 'none';
    best: YarnSummary | null;
    alternatives: YarnSummary[];
  }[];
  const tone = { high: 'good', medium: 'warn', low: 'bad', none: 'bad' } as const;
  const word = { high: 'Sure', medium: 'Likely', low: 'Unsure', none: 'Not found' } as const;
  return [
    h(
      'h2',
      {},
      'Yarn matches',
      h('span', { class: 'sub' }, `${matches.length} ${matches.length === 1 ? 'line' : 'lines'}`),
    ),
    h(
      'div',
      { class: 'rows' },
      ...matches.map(match =>
        h(
          'div',
          { class: 'row' },
          thumb(match.best?.photo_url),
          h(
            'div',
            { class: 'main' },
            h('span', { class: 'receipt' }, match.label),
            match.best
              ? h(
                  'div',
                  {},
                  h('span', { class: 'arrow' }, '→ '),
                  h('strong', {}, [match.best.company, match.best.name].filter(Boolean).join(' ')),
                  ' ',
                  chip(word[match.confidence], tone[match.confidence]),
                )
              : h('div', {}, chip(word.none, 'bad'), ' Ask the user what this yarn is.'),
            match.best && yarnChips(match.best),
            match.best?.reasons && h('div', { class: 'byline' }, match.best.reasons.join(' · ')),
            match.alternatives.length > 0 &&
              h(
                'div',
                { class: 'chips' },
                h('span', { class: 'sub' }, 'Or:'),
                ...match.alternatives.map(alt =>
                  h(
                    'button',
                    {
                      onclick: () => {
                        ask(
                          `For "${match.label}", use ${[alt.company, alt.name].filter(Boolean).join(' ')} (Ravelry yarn ${alt.id}) instead.`,
                        );
                      },
                    },
                    [alt.company, alt.name].filter(Boolean).join(' '),
                  ),
                ),
              ),
          ),
          match.best && linkButton(match.best.url, '↗'),
        ),
      ),
    ),
  ];
}

// ---- Shops ----

function renderShops(data: Data) {
  const shops = (data.shops ?? []) as {
    name: string;
    address: string | null;
    city: string | null;
    distance: number | null;
    phone: string | null;
    website: string | null;
    ravelry_url: string;
    latitude: number | null;
    longitude: number | null;
  }[];
  return [
    h(
      'h2',
      {},
      'Yarn shops',
      h('span', { class: 'sub' }, `${Number(data.total_results ?? shops.length)} found`),
    ),
    shops.length === 0
      ? h('p', { class: 'empty' }, 'No yarn shops found here.')
      : h(
          'div',
          { class: 'rows' },
          ...shops.map(shop =>
            h(
              'div',
              { class: 'row' },
              h('div', { class: 'thumb' }, '🏪'),
              h(
                'div',
                { class: 'main' },
                h('div', { class: 'title' }, shop.name),
                h('div', { class: 'byline' }, shop.address ?? shop.city ?? ''),
                h(
                  'div',
                  { class: 'chips' },
                  shop.distance !== null &&
                    chip(
                      `${shop.distance} ${typeof data.units === 'string' ? data.units : 'km'}`,
                      'accent',
                    ),
                  shop.phone && chip(shop.phone),
                ),
                h(
                  'div',
                  { class: 'actions' },
                  shop.website && linkButton(shop.website, 'Website ↗'),
                  shop.latitude !== null &&
                    shop.longitude !== null &&
                    linkButton(
                      `https://www.openstreetmap.org/?mlat=${shop.latitude}&mlon=${shop.longitude}#map=17/${shop.latitude}/${shop.longitude}`,
                      'Map ↗',
                    ),
                  linkButton(shop.ravelry_url),
                ),
              ),
            ),
          ),
        ),
  ];
}

// ---- Stash, queue, profile ----

function weightBars(totals: [string, number][]): HTMLElement {
  const max = Math.max(1, ...totals.map(([, yards]) => yards));
  return h(
    'div',
    { class: 'bars' },
    ...totals.map(([weight, yards]) => {
      const fill = h('div', { class: 'fill' });
      fill.style.width = `${Math.max(3, (yards / max) * 100)}%`;
      return h(
        'div',
        { class: 'bar' },
        h('span', {}, titleCase(weight)),
        h('div', { class: 'track' }, fill),
        h('span', { class: 'sub' }, `${yards.toLocaleString()} yd`),
      );
    }),
  );
}

function renderStash(data: Data) {
  const stash = (data.stash ?? []) as StashEntry[];
  const totals = Object.entries((data.yards_by_weight ?? {}) as Record<string, number>).sort(
    (a, b) => b[1] - a[1],
  );
  const yards = totals.reduce((sum, [, value]) => sum + value, 0);
  if (stash.length === 0) {
    return [
      h('h2', {}, 'Your stash'),
      h(
        'p',
        { class: 'empty' },
        'Your stash is empty. Send a photo of a receipt or ball band to add yarn.',
      ),
    ];
  }
  return [
    h(
      'h2',
      {},
      'Your stash',
      h('span', { class: 'sub' }, `${stash.length} yarns · ${yards.toLocaleString()} yd`),
    ),
    weightBars(totals),
    h(
      'div',
      { class: 'grid' },
      ...stash.map(entry =>
        h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'body' },
            h('div', { class: 'title' }, entry.yarn),
            entry.colorway && h('div', { class: 'byline' }, entry.colorway),
            h(
              'div',
              { class: 'chips' },
              entry.weight && chip(titleCase(entry.weight), 'accent'),
              entry.skeins ? chip(`${entry.skeins} skein${entry.skeins === 1 ? '' : 's'}`) : null,
              entry.yards ? chip(`${entry.yards} yd`) : null,
            ),
            entry.location && h('div', { class: 'byline' }, `📦 ${entry.location}`),
            h(
              'div',
              { class: 'actions' },
              entry.yarn_url && linkButton(entry.yarn_url),
              h(
                'button',
                {
                  onclick: () => {
                    ask(
                      `What could I make with my ${entry.yarn}${entry.colorway ? ` in ${entry.colorway}` : ''} (stash entry ${entry.id})?`,
                    );
                  },
                },
                'Ideas',
              ),
            ),
          ),
        ),
      ),
    ),
  ];
}

function renderStashIdeas(data: Data) {
  const groups = (data.groups ?? []) as {
    weight: string;
    total_yards: number;
    stash: { yarn: string }[];
    total_matches: number;
    patterns: PatternSummary[];
  }[];
  if (groups.length === 0)
    return [
      h('h2', {}, 'Ideas for your stash'),
      h('p', { class: 'empty' }, 'No stash yarn with a known weight and yardage yet.'),
    ];
  return [
    h('h2', {}, 'Ideas for your stash'),
    ...groups.flatMap(group => [
      h(
        'h3',
        {},
        `${titleCase(group.weight)} · ${group.total_yards.toLocaleString()} yd from ${group.stash.map(s => s.yarn).join(', ')}`,
      ),
      group.patterns.length
        ? h('div', { class: 'grid' }, ...group.patterns.map(patternCard))
        : h('p', { class: 'empty' }, 'Nothing found for this yarn with these filters.'),
    ]),
  ];
}

function renderQueuePicks(data: Data) {
  const candidates = (data.candidates ?? []) as {
    verdict: 'planned_yarn_in_stash' | 'enough_in_stash' | 'unknown' | 'need_yarn';
    pattern_id: number;
    pattern: string;
    url: string;
    weight: string | null;
    yards_needed: string | null;
    yards_available: number;
    shortfall_yards: number | null;
    planned_yarn: string | null;
    matching_stash: { yarn: string; yards: number | null }[];
  }[];
  const label = {
    planned_yarn_in_stash: ['Ready: planned yarn on hand', 'good'],
    enough_in_stash: ['Ready: you have the yarn', 'good'],
    unknown: ['Check the pattern', 'warn'],
    need_yarn: ['Needs yarn', 'bad'],
  } as const;
  if (candidates.length === 0)
    return [h('h2', {}, 'Your queue'), h('p', { class: 'empty' }, 'Your queue is empty.')];
  return [
    h(
      'h2',
      {},
      'What you can start',
      h('span', { class: 'sub' }, `${Number(data.queue_size)} queued`),
    ),
    h(
      'div',
      { class: 'rows' },
      ...candidates.map(item => {
        const [text, tone] = label[item.verdict];
        const needed = Number((item.yards_needed ?? '').split('–')[0]) || 0;
        const fill = h('div', { class: `fill${item.verdict === 'need_yarn' ? ' short' : ''}` });
        fill.style.width = `${needed ? Math.min(100, (item.yards_available / needed) * 100) : 0}%`;
        return h(
          'div',
          { class: 'row' },
          h('div', { class: 'thumb' }, item.verdict === 'need_yarn' ? '🛒' : '✅'),
          h(
            'div',
            { class: 'main' },
            h('div', {}, h('span', { class: 'title' }, item.pattern), ' ', chip(text, tone)),
            h(
              'div',
              { class: 'chips' },
              item.weight && chip(titleCase(item.weight), 'accent'),
              item.yards_needed && chip(`needs ${item.yards_needed} yd`),
              item.planned_yarn && chip(`planned: ${item.planned_yarn}`),
            ),
            needed > 0 &&
              h(
                'div',
                { class: 'need' },
                `You have ${item.yards_available.toLocaleString()} yd of ${item.weight ?? 'this weight'}${item.shortfall_yards ? ` · ${item.shortfall_yards} yd short` : ''}`,
                h('div', { class: 'track' }, fill),
              ),
            item.matching_stash.length > 0 &&
              h(
                'div',
                { class: 'byline' },
                `From: ${item.matching_stash.map(s => `${s.yarn}${s.yards ? ` (${s.yards} yd)` : ''}`).join(', ')}`,
              ),
            h(
              'div',
              { class: 'actions' },
              linkButton(item.url),
              item.verdict === 'need_yarn' &&
                h(
                  'button',
                  {
                    onclick: () => {
                      ask(
                        `Which yarns could I use for "${item.pattern}" (Ravelry pattern ${item.pattern_id})?`,
                      );
                    },
                  },
                  'Yarn ideas',
                ),
            ),
          ),
        );
      }),
    ),
  ];
}

function renderProfile(data: Data) {
  const projects = data.projects as {
    total: number;
    by_status: { name: string; count: number }[];
    recent_finished: { name: string; pattern: string | null; completed: string | null }[];
  };
  const difficulty = data.difficulty as {
    estimated_level: string;
    average_finished: number | null;
  };
  const stash = data.stash as { entries: number; total_yards: number };
  const finished = projects.by_status.find(s => s.name.toLowerCase() === 'finished')?.count ?? 0;
  const list = (title: string, items: { name: string; count: number }[]) =>
    items.length > 0 && [
      h('h3', {}, title),
      weightBars(items.map(item => [item.name, item.count] as [string, number])),
    ];
  const tile = (value: string | number, label: string) =>
    h(
      'div',
      { class: 'stat' },
      h('div', { class: 'value' }, String(value)),
      h('div', { class: 'label' }, label),
    );

  return [
    h(
      'div',
      { class: 'hero' },
      h(
        'div',
        { class: 'name' },
        `🧶 ${String(data.username)}`,
        chip(titleCase(difficulty.estimated_level), 'accent'),
      ),
      h('p', {}, String(data.summary)),
    ),
    h(
      'div',
      { class: 'stats' },
      tile(projects.total, 'projects'),
      tile(finished, 'finished'),
      tile(stash.total_yards.toLocaleString(), 'yards in stash'),
      tile(Number(data.queue_size), 'queued'),
      tile(Number(data.favorites_count), 'favorites'),
    ),
    ...(list(
      'Makes most',
      (data.favourite_categories ?? []) as { name: string; count: number }[],
    ) || []),
    projects.recent_finished.length > 0 && h('h3', {}, 'Recently finished'),
    projects.recent_finished.length > 0 &&
      h(
        'div',
        { class: 'chips' },
        ...projects.recent_finished.map(p =>
          chip(`${p.name}${p.completed ? ` · ${p.completed.slice(0, 7)}` : ''}`),
        ),
      ),
  ];
}

function renderAdded(data: Data, kind: 'stash' | 'queue') {
  const added = (data.added ?? []) as {
    yarn?: string;
    pattern?: string | null;
    colorway?: string | null;
    url: string;
  }[];
  const skipped = ((data.skipped_duplicates ?? data.skipped_already_queued ?? []) as unknown[])
    .length;
  const failed = (data.failed ?? []) as { error: string }[];
  return [
    h(
      'h2',
      {},
      kind === 'stash' ? 'Added to your stash' : 'Added to your queue',
      h('span', { class: 'sub' }, `${added.length} added`),
    ),
    h(
      'div',
      { class: 'rows' },
      ...added.map(item =>
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'thumb' }, '✅'),
          h(
            'div',
            { class: 'main' },
            h('div', { class: 'title' }, item.yarn ?? item.pattern ?? ''),
            item.colorway && h('div', { class: 'byline' }, item.colorway),
          ),
          linkButton(item.url, 'View ↗'),
        ),
      ),
    ),
    skipped > 0 && h('div', { class: 'notice' }, `${skipped} skipped: already in your ${kind}.`),
    failed.length > 0 &&
      h(
        'div',
        { class: 'notice' },
        `${failed.length} failed: ${failed.map(f => f.error).join(' ')}`,
      ),
  ];
}

// ---- Dispatch ----

const renderers: Record<string, (data: Data) => Child[]> = {
  search_patterns: renderPatternSearch,
  get_pattern_details: renderPatternDetails,
  search_yarns: data => renderYarns(data),
  get_yarn_details: data => renderYarns(data, 'Yarn details'),
  find_yarns_for_pattern: renderSubstitutes,
  match_yarns: renderMatches,
  find_yarn_shops: renderShops,
  get_my_stash: renderStash,
  find_patterns_for_my_stash: renderStashIdeas,
  pick_from_my_queue: renderQueuePicks,
  get_my_crafting_profile: renderProfile,
  add_to_my_stash: data => renderAdded(data, 'stash'),
  add_to_my_queue: data => renderAdded(data, 'queue'),
};

function render(data: Data | undefined, isError: boolean) {
  const toolName = app.getHostContext()?.toolInfo?.tool.name ?? '';
  const renderer = renderers[toolName];
  root.replaceChildren();
  if (isError || !data) {
    root.append(h('p', { class: 'empty' }, 'Nothing to show.'));
    return;
  }
  if (!renderer) {
    root.append(h('p', { class: 'empty' }, 'Done.'));
    return;
  }
  for (const child of renderer(data)) {
    if (child) root.append(child);
  }
}

function applyHostContext(context: McpUiHostContext) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

app.addEventListener('toolresult', result => {
  render(result.structuredContent as Data | undefined, Boolean(result.isError));
});
app.addEventListener('hostcontextchanged', applyHostContext);
app.onerror = error => {
  console.error(error);
};

void app.connect().then(() => {
  const context = app.getHostContext();
  if (context) applyHostContext(context);
});
