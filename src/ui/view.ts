import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

import './view.css';

// Two widgets only, chosen from the shape of the tool result:
// - a pattern carousel (search_patterns, discover_patterns_for_me, find_patterns_for_my_stash)
// - a row counter (get_row_counter)

// ---- Data shapes (the tools' structuredContent) ----

interface PatternSummary {
  id: number;
  name: string;
  url: string;
  free: boolean;
  designer: string | null;
  photo_url: string | null;
  why?: string;
  difficulty?: number | null;
}

interface PatternFacts {
  id: number;
  difficulty: number | null;
  yarn_weight: string | null;
  yardage: string | null;
  rating: number | null;
  price: string | null;
}

interface CounterView {
  name: string;
  value: number;
  target: number | null;
  repeat: number | null;
}

interface CounterData {
  project: { id: number; name: string; url: string | null } | null;
  counters: CounterView[];
  other_projects: { id: number; name: string; summary: string }[];
}

type Data = Record<string, unknown>;

// ---- Tiny DOM helpers (textContent only: Ravelry data is never parsed as HTML) ----

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; title?: string; onclick?: () => void } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.title) {
    element.title = props.title;
    element.setAttribute('aria-label', props.title);
  }
  if (props.onclick) element.addEventListener('click', props.onclick);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

const chip = (text: string, tone = '') => h('span', { class: `chip ${tone}`.trim() }, text);

const isRavelryImage = (url: string | null | undefined): url is string =>
  !!url && /^https:\/\/[\w.-]*ravelrycache\.com\//.test(url);

// ---- Host bridge ----

const app = new App({ name: 'Ravelry', version: '2.0.0' }, {}, { autoResize: true });
const root = document.getElementById('app') ?? document.body;

const open = (url: string) => {
  void app.openLink({ url });
};

const ask = (text: string) => {
  void app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
};

function show(children: Child[]) {
  root.replaceChildren();
  for (const child of children) if (child) root.append(child);
}

// ---- Pattern carousel ----

type Reaction = 'like' | 'dislike';
const reactions = new Map<number, { pattern: PatternSummary; reaction: Reaction }>();
let footer: HTMLElement | null = null;

const label = (pattern: PatternSummary) => `"${pattern.name}" (Ravelry pattern ${pattern.id})`;

const picks = (reaction: Reaction) =>
  [...reactions.values()].filter(r => r.reaction === reaction).map(r => r.pattern);

/** Lets the model know the user's picks even before they send anything. */
function shareReactions() {
  const liked = picks('like');
  const disliked = picks('dislike');
  const text = [
    liked.length > 0 && `Liked in the pattern widget: ${liked.map(label).join(', ')}.`,
    disliked.length > 0 && `Not for them: ${disliked.map(label).join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ');
  void app
    .updateModelContext({
      content: text ? [{ type: 'text', text }] : [],
      structuredContent: {
        liked: liked.map(p => p.id),
        not_for_me: disliked.map(p => p.id),
      },
    })
    .catch(() => undefined);
  renderFooter();
}

function renderFooter() {
  if (!footer) return;
  const liked = picks('like');
  const disliked = picks('dislike');
  footer.replaceChildren();
  if (liked.length + disliked.length === 0) {
    footer.append(h('span', { class: 'hint' }, 'Tap 👍 or 👎 to steer the next search.'));
    return;
  }
  footer.append(
    h('span', { class: 'hint' }, `${liked.length} 👍 · ${disliked.length} 👎`),
    h(
      'button',
      {
        class: 'primary',
        onclick: () => {
          ask(
            [
              liked.length > 0 && `I like these patterns: ${liked.map(label).join(', ')}.`,
              disliked.length > 0 && `These are not for me: ${disliked.map(label).join(', ')}.`,
              'Look at what the ones I like have in common (construction, techniques, yarn, ' +
                'style) and find more patterns like them, avoiding what I did not like.',
            ]
              .filter(Boolean)
              .join(' '),
          );
        },
      },
      'Find more like my 👍',
    ),
  );
}

function patternCard(pattern: PatternSummary, facts: Map<number, HTMLElement>): HTMLElement {
  const photo = h('button', { class: 'photo', title: `Open ${pattern.name} on Ravelry` });
  photo.addEventListener('click', () => {
    open(pattern.url);
  });
  if (isRavelryImage(pattern.photo_url)) {
    const img = h('img');
    img.src = pattern.photo_url;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.replaceWith(h('span', { class: 'placeholder' }, '🧶'));
    });
    photo.append(img);
  } else {
    photo.append(h('span', { class: 'placeholder' }, '🧶'));
  }
  photo.append(
    h(
      'span',
      { class: 'ribbon' },
      chip(pattern.free ? 'Free' : 'Paid', pattern.free ? 'good' : ''),
    ),
  );

  const like = h('button', { class: 'react', title: 'I like this' }, '👍');
  const dislike = h('button', { class: 'react', title: 'Not for me' }, '👎');
  const card = h('article', { class: 'pattern' });
  const paint = () => {
    const reaction = reactions.get(pattern.id)?.reaction;
    like.setAttribute('aria-pressed', String(reaction === 'like'));
    dislike.setAttribute('aria-pressed', String(reaction === 'dislike'));
    card.classList.toggle('liked', reaction === 'like');
    card.classList.toggle('disliked', reaction === 'dislike');
  };
  const toggle = (reaction: Reaction) => {
    if (reactions.get(pattern.id)?.reaction === reaction) reactions.delete(pattern.id);
    else reactions.set(pattern.id, { pattern, reaction });
    paint();
    shareReactions();
  };
  like.addEventListener('click', event => {
    event.stopPropagation();
    toggle('like');
  });
  dislike.addEventListener('click', event => {
    event.stopPropagation();
    toggle('dislike');
  });
  paint();

  const factsRow = h(
    'div',
    { class: 'facts' },
    pattern.difficulty ? chip(`Difficulty ${pattern.difficulty}/10`) : null,
  );
  facts.set(pattern.id, factsRow);

  card.append(
    h('div', { class: 'media' }, photo, h('span', { class: 'reacts' }, like, dislike)),
    h(
      'div',
      { class: 'body' },
      h('div', { class: 'title', title: pattern.name }, pattern.name),
      pattern.designer && h('div', { class: 'byline' }, `by ${pattern.designer}`),
      pattern.why && h('div', { class: 'why' }, `✨ ${pattern.why}`),
      factsRow,
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            title: 'Find patterns like this one',
            onclick: () => {
              ask(
                `Find more patterns like ${label(pattern)}: same kind of construction, ` +
                  'techniques and yarn weight.',
              );
            },
          },
          'Similar',
        ),
        h(
          'button',
          {
            title: 'Ask Claude about this pattern',
            onclick: () => {
              ask(
                `Tell me more about ${label(pattern)}: what it involves, yarn and needles, and ` +
                  'whether it suits me.',
              );
            },
          },
          'Details',
        ),
        h(
          'button',
          {
            title: 'Add to my Ravelry queue',
            onclick: () => {
              ask(`Add ${label(pattern)} to my Ravelry queue.`);
            },
          },
          'Queue',
        ),
      ),
    ),
  );
  return card;
}

/** Fills difficulty, yarn weight and yardage on the cards with one details call. */
function loadFacts(facts: Map<number, HTMLElement>) {
  const ids = [...facts.keys()].slice(0, 20);
  if (ids.length === 0) return;
  app
    .callServerTool({ name: 'get_pattern_details', arguments: { ids } })
    .then(result => {
      const patterns = (result.structuredContent as { patterns?: PatternFacts[] } | undefined)
        ?.patterns;
      for (const pattern of patterns ?? []) {
        const row = facts.get(pattern.id);
        if (!row) continue;
        row.replaceChildren(
          ...[
            pattern.difficulty ? chip(`Difficulty ${pattern.difficulty}/10`) : null,
            pattern.yarn_weight
              ? chip(pattern.yarn_weight.replace(/\s*\(.*\)$/, ''), 'accent')
              : null,
            pattern.yardage ? chip(pattern.yardage) : null,
            pattern.rating ? chip(`★ ${pattern.rating}`) : null,
            pattern.price ? chip(pattern.price) : null,
          ].filter((node): node is HTMLSpanElement => node !== null),
        );
      }
    })
    .catch(() => undefined);
}

function carousel(patterns: PatternSummary[], facts: Map<number, HTMLElement>): HTMLElement {
  const track = h('div', { class: 'track' }, ...patterns.map(p => patternCard(p, facts)));
  const scroll = (direction: number) => {
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' });
  };
  return h(
    'div',
    { class: 'carousel' },
    h(
      'button',
      {
        class: 'nav prev',
        title: 'Previous patterns',
        onclick: () => {
          scroll(-1);
        },
      },
      '‹',
    ),
    track,
    h(
      'button',
      {
        class: 'nav next',
        title: 'Next patterns',
        onclick: () => {
          scroll(1);
        },
      },
      '›',
    ),
  );
}

function renderPatterns(data: Data): Child[] {
  const facts = new Map<number, HTMLElement>();
  footer = h('div', { class: 'footer' });
  const sections: Child[] = [];

  if (Array.isArray(data.groups)) {
    // find_patterns_for_my_stash: one carousel per yarn weight.
    const groups = data.groups as {
      weight: string;
      total_yards: number;
      stash: { yarn: string }[];
      patterns: PatternSummary[];
    }[];
    sections.push(h('header', {}, h('h2', {}, 'Ideas for your stash')));
    for (const group of groups) {
      sections.push(
        h(
          'h3',
          {},
          `${group.weight} · ${group.total_yards.toLocaleString()} yd`,
          h('span', { class: 'sub' }, ` from ${group.stash.map(s => s.yarn).join(', ')}`),
        ),
        group.patterns.length
          ? carousel(group.patterns, facts)
          : h('p', { class: 'empty' }, 'Nothing found for this yarn.'),
      );
    }
  } else {
    const patterns = (data.patterns ?? []) as PatternSummary[];
    const title =
      typeof data.skill === 'string'
        ? `Patterns to learn ${data.skill}`
        : 'profile' in data
          ? 'Picked for you'
          : 'Patterns';
    const filters = [
      typeof data.total_results === 'number' && `${data.total_results.toLocaleString()} matches`,
      typeof data.category === 'string' && data.category,
      Array.isArray(data.attributes) &&
        data.attributes.length > 0 &&
        (data.attributes as string[]).join(', '),
    ].filter(Boolean);
    sections.push(
      h(
        'header',
        {},
        h('h2', {}, title),
        filters.length > 0 && h('span', { class: 'sub' }, filters.join(' · ')),
      ),
      patterns.length
        ? carousel(patterns, facts)
        : h('p', { class: 'empty' }, 'No patterns matched.'),
    );
    if (Number(data.page_count ?? 1) > Number(data.page ?? 1)) {
      sections.push(
        h(
          'div',
          { class: 'more-results' },
          h(
            'button',
            {
              onclick: () => {
                ask('Show me the next page of those patterns.');
              },
            },
            'More results',
          ),
        ),
      );
    }
  }

  sections.push(footer);
  renderFooter();
  loadFacts(facts);
  return sections;
}

// ---- Row counter ----

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

let counterState: CounterData | null = null;
const asCounter = (value: unknown) => value as CounterData;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Taps change the screen at once; the server gets the final value shortly after. */
function saveCounter(counter: CounterView) {
  const project = counterState?.project;
  if (!project) return;
  clearTimeout(pending.get(counter.name));
  pending.set(
    counter.name,
    setTimeout(() => {
      pending.delete(counter.name);
      app
        .callServerTool({
          name: 'update_row_counter',
          arguments: {
            project_id: project.id,
            counter: counter.name,
            action: 'set',
            value: counter.value,
          },
        })
        .then(result => {
          root.classList.toggle('offline', Boolean(result.isError));
        })
        .catch(() => {
          root.classList.add('offline');
        });
    }, 350),
  );
}

function configure(args: Record<string, unknown>) {
  const project = counterState?.project;
  if (!project) return;
  app
    .callServerTool({ name: 'update_row_counter', arguments: { project_id: project.id, ...args } })
    .then(result => {
      if (!result.isError) showCounter(asCounter(result.structuredContent));
    })
    .catch(() => {
      root.classList.add('offline');
    });
}

function openCounter(projectId: number) {
  app
    .callServerTool({ name: 'get_row_counter', arguments: { project_id: projectId } })
    .then(result => {
      if (!result.isError) showCounter(asCounter(result.structuredContent));
    })
    .catch(() => undefined);
}

function counterCard(counter: CounterView): HTMLElement {
  const value = h('div', { class: 'value' });
  const position = h('div', { class: 'position' });
  const fill = h('div', { class: 'fill' });
  const bar = h('div', { class: 'bar' }, fill);

  const paint = () => {
    value.textContent = String(counter.value);
    const parts: string[] = [];
    if (counter.repeat && counter.value > 0) {
      parts.push(
        `row ${((counter.value - 1) % counter.repeat) + 1} of ${counter.repeat} · ` +
          `${plural(Math.floor(counter.value / counter.repeat), 'repeat')} done`,
      );
    }
    if (counter.target) {
      const left = counter.target - counter.value;
      parts.push(
        left > 0 ? `${left} to go of ${counter.target}` : `target of ${counter.target} reached 🎉`,
      );
      fill.style.width = `${Math.min(100, (counter.value / counter.target) * 100)}%`;
    }
    position.textContent = parts.join(' · ');
    bar.hidden = !counter.target;
  };
  const change = (delta: number) => {
    counter.value = Math.max(0, counter.value + delta);
    paint();
    saveCounter(counter);
  };

  const minus = h('button', { class: 'step minus', title: `${counter.name} minus one` }, '−');
  const plus = h('button', { class: 'step plus', title: `${counter.name} plus one` }, '+');
  minus.addEventListener('click', () => {
    change(-1);
  });
  plus.addEventListener('click', () => {
    change(1);
  });

  // Reset needs a second tap (dialogs are often blocked in embedded views).
  const reset = h('button', { class: 'quiet' }, 'Reset');
  let armed: ReturnType<typeof setTimeout> | undefined;
  reset.addEventListener('click', () => {
    if (counter.value === 0) return;
    if (!armed) {
      reset.textContent = 'Tap again to reset';
      armed = setTimeout(() => {
        reset.textContent = 'Reset';
        armed = undefined;
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = undefined;
    reset.textContent = 'Reset';
    counter.value = 0;
    paint();
    saveCounter(counter);
  });

  // Target and repeat.
  const settings = h('div', { class: 'settings' });
  settings.hidden = true;
  const field = (text: string, current: number | null, key: 'target' | 'repeat') => {
    const input = h('input');
    input.type = 'number';
    input.min = '1';
    input.inputMode = 'numeric';
    input.placeholder = 'none';
    input.value = current ? String(current) : '';
    input.addEventListener('change', () => {
      const number = Number(input.value);
      configure({ counter: counter.name, action: 'configure', [key]: number > 0 ? number : null });
    });
    return h('label', {}, text, input);
  };
  settings.append(
    field('Target rows', counter.target, 'target'),
    field('Rows per repeat', counter.repeat, 'repeat'),
  );
  const gear = h('button', { class: 'quiet' }, '⚙ Target & repeat');
  gear.addEventListener('click', () => {
    settings.hidden = !settings.hidden;
  });

  const card = h(
    'section',
    { class: 'counter' },
    h('div', { class: 'name' }, counter.name),
    h('div', { class: 'stepper' }, minus, value, plus),
    position,
    bar,
    h('div', { class: 'tools' }, gear, reset),
    settings,
  );
  card.tabIndex = 0;
  card.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement) return;
    if (['ArrowUp', '+', '=', ' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      change(1);
    } else if (['ArrowDown', '-'].includes(event.key)) {
      event.preventDefault();
      change(-1);
    }
  });
  paint();
  return card;
}

function showCounter(data: CounterData) {
  show(renderCounter(data));
}

function renderCounter(data: CounterData): Child[] {
  counterState = data;
  const project = data.project;
  if (!project) {
    return [
      h('header', {}, h('h2', {}, '🔢 Your row counters')),
      data.other_projects.length
        ? h(
            'div',
            { class: 'projects' },
            ...data.other_projects.map(other =>
              h(
                'button',
                {
                  class: 'project',
                  onclick: () => {
                    openCounter(other.id);
                  },
                },
                h('span', { class: 'title' }, other.name),
                h('span', { class: 'sub' }, other.summary),
              ),
            ),
          )
        : h(
            'p',
            { class: 'empty' },
            'No counters yet. Ask Claude to count rows on one of your projects.',
          ),
    ];
  }

  const name = h('input', { class: 'new-name' });
  name.placeholder = 'Add a counter, e.g. Repeats';
  name.maxLength = 40;
  const addCounter = () => {
    const counter = name.value.trim();
    if (counter) configure({ counter, action: 'configure' });
  };
  name.addEventListener('keydown', event => {
    if (event.key === 'Enter') addCounter();
  });

  return [
    h(
      'header',
      {},
      h('h2', {}, `🔢 ${project.name}`),
      project.url &&
        h(
          'button',
          {
            class: 'quiet',
            onclick: () => {
              if (project.url) open(project.url);
            },
          },
          'Ravelry ↗',
        ),
    ),
    data.counters.length
      ? h('div', { class: 'counters' }, ...data.counters.map(counterCard))
      : h(
          'div',
          { class: 'start' },
          h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                configure({ counter: 'Rows', action: 'configure' });
              },
            },
            'Start counting rows',
          ),
        ),
    h(
      'div',
      { class: 'footer' },
      h('div', { class: 'add' }, name, h('button', { onclick: addCounter }, 'Add')),
      data.counters.length > 0 &&
        h(
          'button',
          {
            onclick: () => {
              const counters = counterState?.counters ?? data.counters;
              ask(
                `Log my progress on "${project.name}" (project ${project.id}) to Ravelry: ` +
                  counters
                    .map(
                      c => `${c.name.toLowerCase()} ${c.value}${c.target ? ` of ${c.target}` : ''}`,
                    )
                    .join(', ') +
                  '.',
              );
            },
          },
          'Save to Ravelry log',
        ),
    ),
    data.other_projects.length > 0 &&
      h(
        'div',
        { class: 'switch' },
        h('span', { class: 'sub' }, 'Other projects:'),
        ...data.other_projects.slice(0, 5).map(other =>
          h(
            'button',
            {
              class: 'quiet',
              onclick: () => {
                openCounter(other.id);
              },
            },
            other.name,
          ),
        ),
      ),
  ];
}

// ---- Dispatch ----

function render(data: Data | undefined, isError: boolean) {
  if (isError || !data) {
    show([h('p', { class: 'empty' }, 'Nothing to show.')]);
    return;
  }
  // Hosts do not always say which tool ran, so go by the data itself.
  if ('counters' in data) showCounter(asCounter(data));
  else if ('patterns' in data || 'groups' in data) show(renderPatterns(data));
  else show([]);
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
