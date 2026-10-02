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
  total_yards?: number | null;
  in_projects?: { project_id: number; yards: number | null }[];
  location: string | null;
}

interface ProjectView {
  id: number;
  name: string;
  url: string | null;
  pattern: string | null;
  pattern_url: string | null;
  status: string | null;
  progress: number | null;
  started: string | null;
  completed: string | null;
  size: string | null;
  yarn: {
    yarn: string | null;
    colorway: string | null;
    yards: number | null;
    skeins: number | null;
  }[];
  pattern_needs: string | null;
  log: string | null;
  removed_from_queue?: boolean;
  marked_used_up?: number[];
  released_yarn?: boolean;
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
              entry.yards !== null
                ? chip(
                    entry.total_yards && entry.total_yards !== entry.yards
                      ? `${entry.yards} of ${entry.total_yards} yd free`
                      : `${entry.yards} yd`,
                    entry.yards === 0 ? 'warn' : '',
                  )
                : null,
            ),
            entry.in_projects?.length
              ? h(
                  'div',
                  { class: 'byline' },
                  `🧶 In ${entry.in_projects.length} project${entry.in_projects.length === 1 ? '' : 's'}`,
                )
              : null,
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
              item.yards_needed ? chip(`needs ${item.yards_needed} yd`) : null,
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

// ---- Projects ----

function renderProject(data: Data): Child[] {
  const project = data as unknown as ProjectView;
  const progress = Math.max(0, Math.min(100, project.progress ?? 0));
  const fill = h('div', { class: 'fill' });
  fill.style.width = `${progress}%`;
  const statusTone = /finished/i.test(project.status ?? '')
    ? 'good'
    : /frogged/i.test(project.status ?? '')
      ? 'bad'
      : /hibernat/i.test(project.status ?? '')
        ? 'warn'
        : 'accent';
  const log = (project.log ?? '').split('\n').filter(Boolean).slice(-6).reverse();
  const notices = [
    project.removed_from_queue && 'Removed from your queue.',
    project.released_yarn && 'The yarn went back to your stash.',
    project.marked_used_up?.length &&
      `${project.marked_used_up.length} stash yarn${project.marked_used_up.length === 1 ? '' : 's'} marked as used up.`,
  ].filter(Boolean) as string[];

  return [
    h(
      'div',
      { class: 'hero' },
      h(
        'div',
        { class: 'name' },
        `🧶 ${project.name}`,
        project.status && chip(project.status, statusTone),
      ),
      project.pattern &&
        h('p', {}, `Pattern: ${project.pattern}${project.size ? ` · size ${project.size}` : ''}`),
      h(
        'div',
        { class: 'need' },
        `${progress}% done${project.started ? ` · started ${project.started}` : ''}${project.completed ? ` · finished ${project.completed}` : ''}`,
        h('div', { class: 'track' }, fill),
      ),
    ),
    project.yarn.length > 0 && h('h3', {}, 'Yarn'),
    project.yarn.length > 0 &&
      h(
        'div',
        { class: 'rows' },
        ...project.yarn.map(yarn =>
          h(
            'div',
            { class: 'row' },
            h('div', { class: 'thumb' }, '🧶'),
            h(
              'div',
              { class: 'main' },
              h('div', { class: 'title' }, yarn.yarn ?? 'Yarn'),
              yarn.colorway && h('div', { class: 'byline' }, yarn.colorway),
              h(
                'div',
                { class: 'chips' },
                yarn.yards !== null ? chip(`${yarn.yards} yd`, 'accent') : null,
                yarn.skeins ? chip(`${yarn.skeins} skein${yarn.skeins === 1 ? '' : 's'}`) : null,
              ),
            ),
          ),
        ),
      ),
    project.pattern_needs &&
      h('div', { class: 'notice' }, `The pattern calls for ${project.pattern_needs}.`),
    log.length > 0 && h('h3', {}, 'Progress log'),
    log.length > 0 &&
      h('div', { class: 'rows' }, ...log.map(line => h('div', { class: 'receipt' }, line))),
    ...notices.map(text => h('div', { class: 'notice' }, text)),
    h(
      'div',
      { class: 'actions' },
      project.url && linkButton(project.url, 'Project ↗'),
      project.pattern_url && linkButton(project.pattern_url, 'Pattern ↗'),
      !/finished|frogged/i.test(project.status ?? '') &&
        h(
          'button',
          {
            onclick: () => {
              ask(`I've made progress on "${project.name}" (project ${project.id}): `);
            },
          },
          'Log progress',
        ),
    ),
  ];
}

// ---- Planning (personal) ----

const tile = (value: string | number, label: string) =>
  h(
    'div',
    { class: 'stat' },
    h('div', { class: 'value' }, String(value)),
    h('div', { class: 'label' }, label),
  );

const prettyDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function renderFinishEstimate(data: Data): Child[] {
  const estimate = data.estimate as {
    days: number;
    finish_date: string;
    if_fast: string | null;
    if_slow: string | null;
  };
  const pace = data.pace as { yards_per_day: number; based_on: number } | null;
  const deadline = data.deadline as {
    date: string;
    days_available: number;
    yards_per_day_needed: number;
    verdict: 'comfortable' | 'tight' | 'unlikely' | 'past';
  } | null;
  const verdict = {
    comfortable: ['Comfortable', 'good'],
    tight: ['Tight', 'warn'],
    unlikely: ['Unlikely', 'bad'],
    past: ['Already past', 'bad'],
  } as const;
  return [
    h(
      'div',
      { class: 'hero' },
      h('div', { class: 'name' }, `⏳ ${String(data.what)}`),
      h('p', {}, `About ${estimate.days} days: done around ${prettyDate(estimate.finish_date)}.`),
      estimate.if_fast &&
        estimate.if_slow &&
        estimate.if_fast !== estimate.if_slow &&
        h(
          'p',
          { class: 'sub' },
          `Between ${prettyDate(estimate.if_fast)} on a good streak and ${prettyDate(estimate.if_slow)} at a slower pace.`,
        ),
    ),
    h(
      'div',
      { class: 'stats' },
      tile(Number(data.yards_to_go).toLocaleString(), 'yards to go'),
      pace && tile(pace.yards_per_day, 'your yards / day'),
      pace && tile(pace.based_on, 'projects measured'),
    ),
    deadline &&
      h(
        'div',
        { class: 'notice' },
        chip(verdict[deadline.verdict][0], verdict[deadline.verdict][1]),
        ` For ${prettyDate(deadline.date)}: ${deadline.days_available} days, about ${deadline.yards_per_day_needed} yards a day.`,
      ),
    typeof data.url === 'string' && h('div', { class: 'actions' }, linkButton(data.url)),
  ];
}

function renderShopping(data: Data): Child[] {
  const patterns = (data.patterns ?? []) as {
    pattern_id: number;
    pattern: string;
    url: string;
    weight: string | null;
    yards_needed: number | null;
    yards_to_buy: number | null;
    from_stash: { yarn: string; yards: number }[];
    planned_yarn: { name: string; url: string; skeins_to_buy: number | null } | null;
  }[];
  const byWeight = (data.to_buy_by_weight ?? []) as { weight: string; yards: number }[];
  return [
    h('h2', {}, '🛒 Shopping list'),
    byWeight.length > 0
      ? weightBars(byWeight.map(w => [w.weight, w.yards] as [string, number]))
      : h('p', { class: 'empty' }, 'Your stash covers everything. Nothing to buy!'),
    h(
      'div',
      { class: 'rows' },
      ...patterns.map(item =>
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'thumb' }, item.yards_to_buy ? '🛒' : '✅'),
          h(
            'div',
            { class: 'main' },
            h('div', { class: 'title' }, item.pattern),
            h(
              'div',
              { class: 'chips' },
              item.weight && chip(titleCase(item.weight), 'accent'),
              item.yards_needed ? chip(`needs ${item.yards_needed} yd`) : null,
              item.yards_to_buy
                ? chip(`buy ${item.yards_to_buy} yd`, 'warn')
                : item.yards_needed
                  ? chip('covered by stash', 'good')
                  : null,
              item.planned_yarn?.skeins_to_buy
                ? chip(`${item.planned_yarn.skeins_to_buy} × ${item.planned_yarn.name}`)
                : null,
            ),
            item.from_stash.length > 0 &&
              h(
                'div',
                { class: 'byline' },
                `From your stash: ${item.from_stash.map(s => `${s.yarn} (${s.yards} yd)`).join(', ')}`,
              ),
          ),
          linkButton(item.url, '↗'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          onclick: () => {
            ask('Find yarn shops near me where I could buy this.');
          },
        },
        'Shops near me',
      ),
    ),
  ];
}

function renderQueueReview(data: Data): Child[] {
  interface Item {
    queued_id: number;
    pattern: string;
    queued_on: string | null;
  }
  const duplicates = (data.duplicates ?? []) as Item[];
  const made = (data.already_made ?? []) as (Item & { status: string })[];
  const stale = (data.stale ?? []) as (Item & { years_queued: number })[];
  const years = data.years_to_finish_at_your_pace as number | null;
  const section = (title: string, items: Child[]) =>
    items.length > 0 && [h('h3', {}, title), h('div', { class: 'rows' }, ...items)];
  const row = (emoji: string, title: string, sub: string) =>
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'thumb' }, emoji),
      h(
        'div',
        { class: 'main' },
        h('div', { class: 'title' }, title),
        h('div', { class: 'byline' }, sub),
      ),
    );
  const nothing = duplicates.length + made.length + stale.length === 0;
  return [
    h(
      'div',
      { class: 'hero' },
      h('div', { class: 'name' }, '🧹 Your queue'),
      h(
        'p',
        {},
        years
          ? `${Number(data.queue_size)} patterns, about ${Number(data.total_yards).toLocaleString()} yards: roughly ${years} years at your pace.`
          : `${Number(data.queue_size)} patterns, about ${Number(data.total_yards).toLocaleString()} yards.`,
      ),
    ),
    nothing && h('p', { class: 'empty' }, 'Nothing to tidy: your queue looks good.'),
    ...(section(
      'Queued twice',
      duplicates.map(d => row('👯', d.pattern, `queued again on ${d.queued_on ?? '?'}`)),
    ) || []),
    ...(section(
      'Already made',
      made.map(m => row('✅', m.pattern, m.status)),
    ) || []),
    ...(section(
      'Waiting a long time',
      stale.map(s => row('🕰️', s.pattern, `queued ${s.years_queued} years ago`)),
    ) || []),
  ];
}

function renderStashAudit(data: Data): Child[] {
  interface Ref {
    stash_id: number;
    yarn: string;
    weight: string | null;
    yards: number | null;
  }
  const weights = (data.weights ?? []) as {
    weight: string;
    stash_yards: number;
    projects_last_two_years: number;
    queued_patterns: number;
  }[];
  const unplanned = (data.unplanned ?? []) as Ref[];
  const oldest = (data.oldest ?? []) as (Ref & { years: number })[];
  const leftovers = data.leftovers as { entries: number; yards: number };
  const missing = (data.missing_info ?? []) as Ref[];
  const years = data.years_of_yarn as number | null;
  const list = (items: Ref[], extra: (item: Ref) => string) =>
    h(
      'div',
      { class: 'chips' },
      ...items.map(item =>
        chip(`${item.yarn}${item.yards ? ` · ${item.yards} yd` : ''}${extra(item)}`),
      ),
    );
  return [
    h(
      'div',
      { class: 'hero' },
      h('div', { class: 'name' }, '🧶 Stash check-up'),
      h(
        'p',
        {},
        years
          ? `At your pace, your stash would last about ${years} year${years === 1 ? '' : 's'}.`
          : 'Finish a few projects with their yarn recorded to see how long your stash would last.',
      ),
    ),
    h(
      'div',
      { class: 'stats' },
      tile(Number(data.entries), 'yarns'),
      tile(Number(data.total_yards).toLocaleString(), 'yards'),
      tile(Number(data.total_miles), 'miles'),
      data.yards_used_last_year !== null &&
        tile(Number(data.yards_used_last_year).toLocaleString(), 'yards used last year'),
    ),
    weights.length > 0 && h('h3', {}, 'By weight'),
    weights.length > 0 &&
      h(
        'div',
        { class: 'rows' },
        ...weights.map(w =>
          h(
            'div',
            { class: 'row' },
            h(
              'div',
              { class: 'main' },
              h('div', { class: 'title' }, titleCase(w.weight)),
              h(
                'div',
                { class: 'chips' },
                chip(`${w.stash_yards.toLocaleString()} yd`, 'accent'),
                chip(
                  `${w.projects_last_two_years} made in 2 years`,
                  w.projects_last_two_years ? '' : 'warn',
                ),
                chip(`${w.queued_patterns} queued`, w.queued_patterns ? 'good' : ''),
              ),
            ),
          ),
        ),
      ),
    unplanned.length > 0 && h('h3', {}, 'No plans yet'),
    unplanned.length > 0 && list(unplanned, () => ''),
    oldest.length > 0 && h('h3', {}, 'Oldest yarn'),
    oldest.length > 0 && list(oldest, item => ` · ${(item as Ref & { years: number }).years} yrs`),
    leftovers.entries > 0 &&
      h(
        'div',
        { class: 'notice' },
        `${leftovers.entries} leftovers (${leftovers.yards} yd): enough for a scrappy project.`,
      ),
    missing.length > 0 &&
      h(
        'div',
        { class: 'notice' },
        `${missing.length} entries need a weight or yardage on Ravelry.`,
      ),
    h(
      'div',
      { class: 'actions' },
      unplanned.length > 0 &&
        h(
          'button',
          {
            onclick: () => {
              ask('Suggest patterns for the yarn in my stash that has no plans yet.');
            },
          },
          'Ideas for unplanned yarn',
        ),
      leftovers.entries > 0 &&
        h(
          'button',
          {
            onclick: () => {
              ask('Suggest scrap projects for my stash leftovers.');
            },
          },
          'Scrap projects',
        ),
    ),
  ];
}

function renderDiscover(data: Data): Child[] {
  const profile = data.profile as {
    level: string;
    favourite_styles: { name: string }[];
    skills_to_try: string[];
  };
  const patterns = (data.patterns ?? []) as (PatternSummary & {
    difficulty: number | null;
    why: string;
  })[];
  return [
    h(
      'h2',
      {},
      typeof data.skill === 'string' ? `Learn ${data.skill}` : 'Picked for you',
      h('span', { class: 'sub' }, titleCase(profile.level)),
    ),
    profile.favourite_styles.length > 0 &&
      h(
        'div',
        { class: 'chips' },
        h('span', { class: 'sub' }, 'Your style:'),
        ...profile.favourite_styles.slice(0, 5).map(s => chip(s.name, 'accent')),
      ),
    patterns.length
      ? h(
          'div',
          { class: 'grid' },
          ...patterns.map(pattern => {
            const card = patternCard(pattern);
            card
              .querySelector('.byline')
              ?.after(
                h(
                  'div',
                  { class: 'chips' },
                  chip(`✨ ${pattern.why}`, 'good'),
                  pattern.difficulty ? chip(`difficulty ${pattern.difficulty}/10`) : null,
                ),
              );
            return card;
          }),
        )
      : h('p', { class: 'empty' }, 'Nothing new found; try another category or skill.'),
    profile.skills_to_try.length > 0 &&
      h(
        'div',
        { class: 'chips' },
        h('span', { class: 'sub' }, 'Skills to try:'),
        ...profile.skills_to_try.map(skill =>
          h(
            'button',
            {
              onclick: () => {
                ask(`Find me patterns to learn ${skill}.`);
              },
            },
            skill,
          ),
        ),
      ),
  ];
}

function renderNeedles(data: Data): Child[] {
  const needles = (data.needles ?? []) as {
    mm: number | null;
    type: string | null;
    length_cm: number | null;
  }[];
  const pattern = data.pattern as {
    name: string;
    url: string;
    in_the_round: boolean;
    sizes: { name: string; suitable: boolean; owned: unknown[] }[];
    missing: string[];
  } | null;
  return [
    pattern &&
      h(
        'div',
        { class: 'hero' },
        h('div', { class: 'name' }, `🪡 Needles for ${pattern.name}`),
        h(
          'p',
          {},
          pattern.missing.length === 0
            ? 'You have everything it calls for.'
            : `Missing: ${pattern.missing.join(', ')}${pattern.in_the_round ? ' (circular or DPNs, it is worked in the round)' : ''}.`,
        ),
        h(
          'div',
          { class: 'chips' },
          ...pattern.sizes.map(size =>
            chip(size.name, size.suitable ? 'good' : size.owned.length ? 'warn' : 'bad'),
          ),
        ),
      ),
    h('h3', {}, `Your needles and hooks (${needles.length})`),
    needles.length
      ? h(
          'div',
          { class: 'chips' },
          ...needles.map(n =>
            chip(
              [n.mm ? `${n.mm} mm` : null, n.type, n.length_cm ? `${n.length_cm} cm` : null]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
        )
      : h(
          'p',
          { class: 'empty' },
          'No needles recorded on Ravelry yet (Ravelry → your notebook → needles).',
        ),
  ];
}

// ---- Row counter ----

interface CounterView {
  name: string;
  value: number;
  target: number | null;
  repeat: number | null;
  row_in_repeat: number | null;
  repeats_done: number | null;
  remaining: number | null;
}

function showCounter(data: Data) {
  root.replaceChildren();
  for (const child of renderCounter(data)) if (child) root.append(child);
}

function renderCounter(data: Data): Child[] {
  const project = data.project as { id: number; name: string; url: string | null } | null;
  const counters = (data.counters ?? []) as CounterView[];
  const others = (data.other_projects ?? []) as { id: number; name: string; summary: string }[];
  if (!project) {
    return [
      h('h2', {}, '🔢 Row counters'),
      others.length
        ? h(
            'div',
            { class: 'rows' },
            ...others.map(other =>
              h(
                'div',
                { class: 'row' },
                h('div', { class: 'thumb' }, '🧶'),
                h(
                  'div',
                  { class: 'main' },
                  h('div', { class: 'title' }, other.name),
                  h('div', { class: 'byline' }, other.summary),
                ),
                h(
                  'button',
                  {
                    onclick: () => {
                      void app
                        .callServerTool({
                          name: 'get_row_counter',
                          arguments: { project_id: other.id },
                        })
                        .then(result => {
                          showCounter(result.structuredContent as Data);
                        });
                    },
                  },
                  'Open',
                ),
              ),
            ),
          )
        : h('p', { class: 'empty' }, 'No counters yet. Ask to count rows on one of your projects.'),
    ];
  }

  const update = (counter: string, args: Record<string, unknown>, buttons: HTMLButtonElement[]) => {
    for (const button of buttons) button.disabled = true;
    app
      .callServerTool({
        name: 'update_row_counter',
        arguments: { project_id: project.id, counter, ...args },
      })
      .then(result => {
        if (result.isError) throw new Error('update failed');
        showCounter(result.structuredContent as Data);
      })
      .catch(() => {
        for (const button of buttons) button.disabled = false;
      });
  };

  const card = (counter: CounterView) => {
    const minus = h('button', { class: 'big', title: 'One row back' }, '−');
    const plus = h('button', { class: 'big primary', title: 'One more row' }, '+');
    const reset = h('button', { title: 'Back to 0' }, 'Reset');
    const buttons = [minus, plus, reset];
    minus.addEventListener('click', () => {
      update(counter.name, { action: 'subtract' }, buttons);
    });
    plus.addEventListener('click', () => {
      update(counter.name, { action: 'add' }, buttons);
    });
    reset.addEventListener('click', () => {
      if (counter.value === 0 || confirm(`Reset ${counter.name} to 0?`)) {
        update(counter.name, { action: 'reset' }, buttons);
      }
    });
    const fill = h('div', { class: 'fill' });
    if (counter.target)
      fill.style.width = `${Math.min(100, (counter.value / counter.target) * 100)}%`;
    return h(
      'div',
      { class: 'counter' },
      h('div', { class: 'label' }, counter.name),
      h(
        'div',
        { class: 'count' },
        minus,
        h('div', { class: 'value' }, String(counter.value)),
        plus,
      ),
      h(
        'div',
        { class: 'chips' },
        counter.repeat && counter.row_in_repeat
          ? chip(
              `row ${counter.row_in_repeat} of ${counter.repeat} · ${counter.repeats_done ?? 0} repeats done`,
              'accent',
            )
          : null,
        counter.target
          ? chip(
              counter.remaining
                ? `${counter.remaining} to go of ${counter.target}`
                : 'Target reached! 🎉',
              counter.remaining ? '' : 'good',
            )
          : null,
      ),
      counter.target ? h('div', { class: 'track' }, fill) : null,
      h('div', { class: 'actions' }, reset),
    );
  };

  const start = h('button', { class: 'primary' }, 'Start counting rows');
  start.addEventListener('click', () => {
    update('Rows', { action: 'configure' }, [start]);
  });

  return [
    h('h2', {}, `🔢 ${project.name}`),
    counters.length
      ? h('div', { class: 'counters' }, ...counters.map(card))
      : h('div', { class: 'actions' }, start),
    h(
      'div',
      { class: 'actions' },
      counters.length > 0 &&
        h(
          'button',
          {
            onclick: () => {
              ask(
                `Log my progress on "${project.name}" (project ${project.id}) to Ravelry: ${counters
                  .map(
                    c => `${c.name.toLowerCase()} ${c.value}${c.target ? ` of ${c.target}` : ''}`,
                  )
                  .join(', ')}.`,
              );
            },
          },
          'Save to Ravelry log',
        ),
      h(
        'button',
        {
          onclick: () => {
            ask(`Add another counter to "${project.name}" (project ${project.id}): `);
          },
        },
        'Add a counter',
      ),
      project.url && linkButton(project.url, 'Project ↗'),
    ),
  ];
}

const renderers: Record<string, (data: Data) => Child[]> = {
  get_my_project: renderProject,
  start_project: renderProject,
  log_project_progress: renderProject,
  update_project_status: renderProject,
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
  estimate_finish_date: renderFinishEstimate,
  plan_yarn_shopping: renderShopping,
  review_my_queue: renderQueueReview,
  audit_my_stash: renderStashAudit,
  discover_patterns_for_me: renderDiscover,
  get_my_needles: renderNeedles,
  get_row_counter: renderCounter,
  update_row_counter: renderCounter,
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
