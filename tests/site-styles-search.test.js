import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  FakeEvent,
  createColorThemeDomFixture,
  createImageBlocksDomFixture,
  createSiteStylesDomFixture,
} from './helpers/fake-site-styles-dom.js';

const SCRIPT_SOURCE = readFileSync(
  new URL('../site-styles-search.js', import.meta.url),
  'utf8',
);

const TARGET_PATH = '/config/site-styles/fonts/assign-styles';
const COLOR_THEME_PATH = '/config/site-styles/colors/theme-editor';
const IMAGE_BLOCKS_PATH = '/config/site-styles/accessories/image-blocks';
const CONTROLLER_KEY = '__SQS_SITE_STYLES_SEARCH_ROUTE_DETECTOR__';
const SECTION_ATTR = 'data-sn-site-styles-section';
const HIDDEN_ATTR = 'data-sn-site-styles-hidden';
const OWNED_ATTR = 'data-sn-site-styles-owned';
const COLLAPSE_BUTTON_ID = 'sn-site-styles-collapse-toggle';
const ALL_COLLAPSED_ATTR = 'data-sn-site-styles-all-collapsed';

function isHidden(element) {
  return element.hasAttribute(HIDDEN_ATTR);
}

function search(harness, value) {
  const input = harness.dom.document.getElementById('sn-site-styles-search-input');
  input.value = value;
  input.dispatchEvent(new FakeEvent('input'));
}

function createBrowserHarness({
  pathname = '/config',
  iframe = true,
  inaccessibleParent = false,
  sectionDefinitions = null,
  colorSectionDefinitions = null,
  colorThemePickerHeading = '',
  imageSectionDefinitions = null,
} = {}) {
  const logs = [];
  const intervals = new Map();
  const dom = imageSectionDefinitions
    ? createImageBlocksDomFixture(imageSectionDefinitions)
    : colorSectionDefinitions
      ? createColorThemeDomFixture(colorSectionDefinitions, {
        themePickerHeading: colorThemePickerHeading,
      })
      : sectionDefinitions
        ? createSiteStylesDomFixture(sectionDefinitions)
        : null;
  const timeouts = new Map();
  let nextIntervalId = 1;
  let nextTimeoutId = 1;

  const parentWindow = {
    location: { pathname },
    document: dom?.document,
    MutationObserver: dom?.MutationObserver,
    console: {
      log(message) {
        logs.push(message);
      },
    },
    setInterval(callback, delay) {
      const id = nextIntervalId;
      nextIntervalId += 1;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback) {
      const id = nextTimeoutId++;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
  };

  let exposedParent = parentWindow;
  if (inaccessibleParent) {
    exposedParent = new Proxy(parentWindow, {
      get(target, property, receiver) {
        if (property === 'location') {
          throw new Error('Blocked parent location');
        }
        return Reflect.get(target, property, receiver);
      },
    });
  }

  let frameWindow;
  if (iframe) {
    frameWindow = { top: exposedParent };
    frameWindow.self = frameWindow;
  } else {
    frameWindow = parentWindow;
    frameWindow.top = frameWindow;
    frameWindow.self = frameWindow;
  }

  const context = vm.createContext({ window: frameWindow });

  return {
    parentWindow,
    logs,
    intervals,
    dom,
    evaluate() {
      vm.runInContext(SCRIPT_SOURCE, context);
    },
    setPathname(nextPathname) {
      parentWindow.location.pathname = nextPathname;
    },
    tick() {
      for (const { callback } of [...intervals.values()]) {
        callback();
      }
    },
    flushTimeouts() {
      for (const [id, callback] of [...timeouts]) {
        timeouts.delete(id);
        callback();
      }
    },
  };
}

const EDITOR_SECTIONS = [
  {
    heading: 'Header',
    rows: [
      { title: 'Site Title', assignedStyle: 'Heading' },
      { title: 'Site Navigation', assignedStyle: 'Paragraph' },
    ],
  },
  {
    heading: 'Newsletter Block',
    rows: [
      { title: 'Title', assignedStyle: 'Heading' },
      { title: 'Description', assignedStyle: 'Paragraph' },
    ],
  },
];

const COLOR_THEME_SECTIONS = [
  {
    heading: 'Header',
    rows: [
      { title: 'Site Title', colorVar: 'siteTitleColor' },
      { title: 'Navigation Links', colorVar: 'navigationLinkColor' },
    ],
  },
  {
    heading: 'Image Block',
    rows: [
      { title: 'Overlay Color', colorVar: 'imageOverlayColor' },
      { title: 'Title Background', colorVar: 'imageTitleBackgroundColor' },
    ],
  },
];

const IMAGE_BLOCK_SECTIONS = [
  {
    heading: 'Image Block: Poster',
    rows: [
      { title: 'Text Alignment', kind: 'select', currentValue: 'Left' },
      { title: 'Content Width', currentValue: '70%', rangeValue: '70' },
    ],
  },
  {
    heading: 'Image Block: Card',
    rows: [
      { title: 'Content Position', kind: 'select', currentValue: 'Center' },
      { title: 'Image Width', currentValue: '50%', rangeValue: '50' },
    ],
  },
];

test('mounts the shared controls on the exact Image Blocks route', () => {
  const harness = createBrowserHarness({
    pathname: IMAGE_BLOCKS_PATH,
    imageSectionDefinitions: IMAGE_BLOCK_SECTIONS,
  });

  harness.evaluate();

  const input = harness.dom.document.getElementById('sn-site-styles-search-input');
  const collapseButton = harness.dom.document.getElementById(COLLAPSE_BUTTON_ID);
  assert.ok(input);
  assert.equal(input.placeholder, 'Search image block settings');
  assert.equal(
    collapseButton.getAttribute('class'),
    harness.dom.sections[0].label.getAttribute('class'),
  );
  assert.ok(harness.dom.sections.every(({ label }) => label.getAttribute(SECTION_ATTR) === ''));
  assert.deepEqual(harness.logs, ['[Site Styles Search] Image Blocks page detected.']);
});

test('filters Image Blocks headings and setting names without matching current values', () => {
  const harness = createBrowserHarness({
    pathname: IMAGE_BLOCKS_PATH,
    imageSectionDefinitions: IMAGE_BLOCK_SECTIONS,
  });
  harness.evaluate();

  search(harness, 'image block: card');
  assert.equal(isHidden(harness.dom.sections[0].label), true);
  assert.equal(isHidden(harness.dom.sections[1].label), false);
  assert.ok(harness.dom.sections[1].rows.every(({ wrapper }) => !isHidden(wrapper)));

  search(harness, 'image width');
  assert.equal(isHidden(harness.dom.sections[1].label), false);
  assert.equal(isHidden(harness.dom.sections[1].rows[0].wrapper), true);
  assert.equal(isHidden(harness.dom.sections[1].rows[1].wrapper), false);

  search(harness, 'center');
  assert.ok(harness.dom.sections.every(({ label }) => isHidden(label)));

  search(harness, '70%');
  assert.ok(harness.dom.sections.every(({ label }) => isHidden(label)));
  assert.equal(
    isHidden(harness.dom.document.getElementById('sn-site-styles-search-empty')),
    false,
  );
});

test('restores Image Blocks accordion state after React replaces the settings list', () => {
  const harness = createBrowserHarness({
    pathname: IMAGE_BLOCKS_PATH,
    imageSectionDefinitions: IMAGE_BLOCK_SECTIONS,
  });
  harness.evaluate();

  harness.dom.sections[0].label.dispatchEvent(new FakeEvent('click'));
  assert.ok(harness.dom.sections[0].rows.every(({ wrapper }) => isHidden(wrapper)));

  harness.dom.replaceList(IMAGE_BLOCK_SECTIONS);
  harness.dom.flushMutations();
  harness.flushTimeouts();

  assert.equal(harness.dom.sections[0].label.getAttribute('aria-expanded'), 'false');
  assert.ok(harness.dom.sections[0].rows.every(({ wrapper }) => isHidden(wrapper)));
  assert.equal(
    harness.dom.document.querySelectorAll('input')
      .filter(({ id }) => id === 'sn-site-styles-search-input').length,
    1,
  );
});

test('unmounts Image Blocks controls and logs exit on a nested route', () => {
  const harness = createBrowserHarness({
    pathname: IMAGE_BLOCKS_PATH,
    imageSectionDefinitions: IMAGE_BLOCK_SECTIONS,
  });
  harness.evaluate();

  harness.setPathname(`${IMAGE_BLOCKS_PATH}/advanced`);
  harness.tick();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.deepEqual(harness.logs, [
    '[Site Styles Search] Image Blocks page detected.',
    '[Site Styles Search] Image Blocks page exited.',
  ]);
});

test('mounts the shared controls on the exact Color Theme route', () => {
  const harness = createBrowserHarness({
    pathname: COLOR_THEME_PATH,
    colorSectionDefinitions: COLOR_THEME_SECTIONS,
  });

  harness.evaluate();

  const input = harness.dom.document.getElementById('sn-site-styles-search-input');
  const collapseButton = harness.dom.document.getElementById(COLLAPSE_BUTTON_ID);
  assert.ok(input);
  assert.equal(input.placeholder, 'Search color settings');
  assert.equal(
    collapseButton.getAttribute('class'),
    harness.dom.sections[0].label.getAttribute('class'),
  );
  assert.deepEqual(harness.logs, ['[Site Styles Search] Color theme editor detected.']);
});

test('filters Color Theme headings and setting names without matching color variable IDs', () => {
  const harness = createBrowserHarness({
    pathname: COLOR_THEME_PATH,
    colorSectionDefinitions: COLOR_THEME_SECTIONS,
  });
  harness.evaluate();

  search(harness, 'image block');
  assert.equal(isHidden(harness.dom.sections[0]), true);
  assert.equal(isHidden(harness.dom.sections[1]), false);
  assert.ok(harness.dom.sections[1].rows.every(({ wrapper }) => !isHidden(wrapper)));

  search(harness, 'overlay color');
  assert.equal(isHidden(harness.dom.sections[1]), false);
  assert.equal(isHidden(harness.dom.sections[1].rows[0].wrapper), false);
  assert.equal(isHidden(harness.dom.sections[1].rows[1].wrapper), true);

  search(harness, 'siteTitleColor');
  assert.ok(harness.dom.sections.every((section) => isHidden(section)));
  assert.equal(
    isHidden(harness.dom.document.getElementById('sn-site-styles-search-empty')),
    false,
  );
});

test('restores Color Theme accordion state after a React list replacement', () => {
  const harness = createBrowserHarness({
    pathname: COLOR_THEME_PATH,
    colorSectionDefinitions: COLOR_THEME_SECTIONS,
  });
  harness.evaluate();

  harness.dom.sections[0].label.dispatchEvent(new FakeEvent('click'));
  assert.ok(harness.dom.sections[0].rows.every(({ wrapper }) => isHidden(wrapper)));

  harness.dom.replaceList(COLOR_THEME_SECTIONS);
  harness.dom.flushMutations();
  harness.flushTimeouts();

  assert.equal(
    harness.dom.document.querySelectorAll('input')
      .filter(({ id }) => id === 'sn-site-styles-search-input').length,
    1,
  );
  assert.equal(harness.dom.sections[0].label.getAttribute('aria-expanded'), 'false');
  assert.ok(harness.dom.sections[0].rows.every(({ wrapper }) => isHidden(wrapper)));
});

test('unmounts Color Theme controls and logs exit on a nested route', () => {
  const harness = createBrowserHarness({
    pathname: COLOR_THEME_PATH,
    colorSectionDefinitions: COLOR_THEME_SECTIONS,
  });
  harness.evaluate();

  harness.setPathname(`${COLOR_THEME_PATH}/advanced`);
  harness.tick();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.deepEqual(harness.logs, [
    '[Site Styles Search] Color theme editor detected.',
    '[Site Styles Search] Color theme editor exited.',
  ]);
});

test('ignores an unrelated heading outside the Color Theme section list', () => {
  const harness = createBrowserHarness({
    pathname: COLOR_THEME_PATH,
    colorSectionDefinitions: COLOR_THEME_SECTIONS,
    colorThemePickerHeading: 'Choose a theme',
  });

  harness.evaluate();

  assert.ok(harness.dom.document.getElementById('sn-site-styles-search-input'));
  assert.equal(harness.dom.sections[0].label.getAttribute(SECTION_ATTR), '');
});

test('reindexes in-place Color Theme text changes and restores a removed indicator', () => {
  const harness = createBrowserHarness({
    pathname: COLOR_THEME_PATH,
    colorSectionDefinitions: COLOR_THEME_SECTIONS,
  });
  harness.evaluate();

  const firstSection = harness.dom.sections[0];
  firstSection.rows[0].button.querySelector('p').textContent = 'Brand Name';
  firstSection.label.children[0].remove();
  harness.dom.queueMutation();
  harness.dom.flushMutations();
  harness.flushTimeouts();

  search(harness, 'brand name');
  assert.equal(isHidden(firstSection), false);
  assert.equal(isHidden(firstSection.rows[0].wrapper), false);
  assert.equal(isHidden(firstSection.rows[1].wrapper), true);
  assert.equal(firstSection.label.children.length, 1);
  assert.equal(firstSection.label.children[0].tagName, 'SPAN');
  assert.equal(
    harness.dom.mutationObservers.at(-1).observed[0].options.characterData,
    true,
  );
});

test('mounts one namespaced interface only on the exact assignment route', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();

  assert.ok(harness.dom.document.getElementById('sn-site-styles-search'));
  assert.ok(harness.dom.document.getElementById('sn-site-styles-search-styles'));
  assert.equal(
    harness.dom.document.getElementById('sn-site-styles-search').getAttribute(OWNED_ATTR),
    '',
  );
  assert.equal(
    harness.dom.document.getElementById('sn-site-styles-search-styles').getAttribute(OWNED_ATTR),
    '',
  );
  assert.equal(harness.dom.sections[0].label.getAttribute('data-sn-site-styles-section'), '');
  assert.equal(harness.dom.document.querySelectorAll('input').length, 1);
});

test('mounts explicit input styles that remain visible under editor resets', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();

  const styles = harness.dom.document.getElementById('sn-site-styles-search-styles').textContent;

  assert.match(styles, /height: 40px;/);
  assert.match(styles, /padding: 0 12px;/);
  assert.match(styles, /border: 1px solid #cfcfcf;/);
  assert.match(styles, /#sn-site-styles-search-input::placeholder/);
  assert.match(styles, /color: #737373;/);
  assert.match(styles, /#sn-site-styles-search-input:focus/);
});

test('mounts the search controls as a sticky editor toolbar', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();

  const styles = harness.dom.document.getElementById('sn-site-styles-search-styles').textContent;

  assert.match(styles, /#sn-site-styles-search \{[\s\S]*position: sticky;/);
  assert.match(styles, /#sn-site-styles-search \{[\s\S]*top: 0;/);
  assert.match(styles, /#sn-site-styles-search \{[\s\S]*z-index: 1;/);
  assert.match(styles, /#sn-site-styles-search \{[\s\S]*background: #fff;/);
});

test('places a full-width search above a left-aligned bulk action styled like section labels', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();

  const root = harness.dom.document.getElementById('sn-site-styles-search');
  const collapseButton = harness.dom.document.getElementById(COLLAPSE_BUTTON_ID);
  const firstLabel = harness.dom.sections[0].label;
  const styles = harness.dom.document.getElementById('sn-site-styles-search-styles').textContent;
  const toolbarRule = styles.match(/#sn-site-styles-search \{([^}]*)\}/)[1];
  const bulkActionRule = styles.match(/#sn-site-styles-collapse-toggle \{([^}]*)\}/)[1];

  assert.deepEqual(root.children.slice(0, 2).map(({ id }) => id), [
    'sn-site-styles-search-input',
    COLLAPSE_BUTTON_ID,
  ]);
  assert.match(toolbarRule, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(toolbarRule, /gap: 4px;/);
  assert.match(toolbarRule, /margin-top: 8px;/);
  assert.match(toolbarRule, /padding: 0 0 10px;/);
  assert.match(bulkActionRule, /justify-self: start;/);
  assert.match(bulkActionRule, /margin-top: 0;/);
  assert.match(bulkActionRule, /margin-bottom: 0;/);
  assert.match(bulkActionRule, /border: 0;/);
  assert.match(bulkActionRule, /background: transparent;/);
  assert.equal(collapseButton.getAttribute('class'), firstLabel.getAttribute('class'));
  assert.doesNotMatch(bulkActionRule, /color:/);
  assert.doesNotMatch(bulkActionRule, /font:/);
  assert.doesNotMatch(bulkActionRule, /font-size:/);
  assert.doesNotMatch(bulkActionRule, /text-transform:/);
  assert.doesNotMatch(bulkActionRule, /line-height:/);
  assert.match(styles, /#sn-site-styles-collapse-toggle::after/);
});

test('stays inert when the semantic label and button structure is incomplete', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: [] });
  harness.evaluate();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.equal(harness.intervals.size, 1);
});

test('stays inert when a candidate list mixes valid and malformed sections', () => {
  const harness = createBrowserHarness({
    pathname: TARGET_PATH,
    sectionDefinitions: [...EDITOR_SECTIONS, { heading: 'Broken Section', rows: [] }],
  });
  harness.evaluate();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.equal(harness.dom.sections[0].label.hasAttribute('data-sn-site-styles-section'), false);
});

test('stays fully inert when one row omits its title paragraph', () => {
  const harness = createBrowserHarness({
    pathname: TARGET_PATH,
    sectionDefinitions: [
      EDITOR_SECTIONS[0],
      {
        heading: 'Newsletter Block',
        rows: [
          { title: 'Title', assignedStyle: 'Heading', omitTitleParagraph: true },
          { title: 'Description', assignedStyle: 'Paragraph' },
        ],
      },
    ],
  });

  harness.evaluate();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), null);
  assert.equal(harness.dom.document.querySelectorAll('input').length, 0);
  assert.equal(harness.dom.mutationObservers.length, 0);
  for (const section of harness.dom.sections) {
    assert.equal(section.hasAttribute(HIDDEN_ATTR), false);
    assert.equal(section.label.hasAttribute(SECTION_ATTR), false);
    assert.equal(section.label.hasAttribute('role'), false);
    assert.equal(section.label.hasAttribute('tabindex'), false);
    assert.equal(section.label.hasAttribute('aria-expanded'), false);
    assert.equal(section.label.querySelector('span'), null);
    assert.ok(section.rows.every(({ button }) => !button.hasAttribute(HIDDEN_ATTR)));
  }
});

test('stays fully inert and preserves a foreign search UI ID collision', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  const foreignUi = harness.dom.document.createElement('div');
  foreignUi.id = 'sn-site-styles-search';
  foreignUi.textContent = 'Foreign search content';
  harness.dom.main.insertBefore(foreignUi, harness.dom.list);

  harness.evaluate();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), foreignUi);
  assert.equal(foreignUi.textContent, 'Foreign search content');
  assert.equal(foreignUi.hasAttribute(OWNED_ATTR), false);
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), null);
  assert.equal(harness.dom.document.querySelectorAll('input').length, 0);
  assert.ok(harness.dom.sections.every(({ label }) => !label.hasAttribute(SECTION_ATTR)));
  harness.parentWindow[CONTROLLER_KEY].destroy();
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), foreignUi);
});

test('stays fully inert and preserves a foreign style ID collision', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  const foreignStyle = harness.dom.document.createElement('style');
  foreignStyle.id = 'sn-site-styles-search-styles';
  foreignStyle.textContent = 'body { color: hotpink; }';
  harness.dom.document.head.append(foreignStyle);

  harness.evaluate();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), foreignStyle);
  assert.equal(foreignStyle.textContent, 'body { color: hotpink; }');
  assert.equal(foreignStyle.hasAttribute(OWNED_ATTR), false);
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.ok(harness.dom.sections.every(({ label }) => !label.hasAttribute(SECTION_ATTR)));
  harness.parentWindow[CONTROLLER_KEY].destroy();
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), foreignStyle);
});

test('stays fully inert when an owned search ID has malformed child structure', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  const malformedUi = harness.dom.document.createElement('div');
  malformedUi.id = 'sn-site-styles-search';
  malformedUi.setAttribute(OWNED_ATTR, '');
  const unexpectedChild = harness.dom.document.createElement('p');
  unexpectedChild.textContent = 'Not the required controls';
  malformedUi.append(unexpectedChild);
  harness.dom.main.insertBefore(malformedUi, harness.dom.list);

  harness.evaluate();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), malformedUi);
  assert.equal(malformedUi.children.length, 1);
  assert.equal(malformedUi.firstElementChild, unexpectedChild);
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), null);
  assert.ok(harness.dom.sections.every(({ label }) => !label.hasAttribute(SECTION_ATTR)));
});

test('unmounts interface additions on a nested assignment route', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  harness.setPathname(`${TARGET_PATH}/site-title-font`);
  harness.tick();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), null);
  assert.equal(harness.dom.sections[0].label.hasAttribute('data-sn-site-styles-section'), false);
});

test('detects the font assignment page immediately and starts one 800ms poll', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH });

  harness.evaluate();

  assert.deepEqual(harness.logs, [
    '[Site Styles Search] Font assignment page detected.',
  ]);
  assert.equal(harness.intervals.size, 1);
  assert.equal([...harness.intervals.values()][0].delay, 800);
});

test('logs only entry and exit transitions during SPA navigation', () => {
  const harness = createBrowserHarness({ pathname: '/config/site-styles/fonts' });

  harness.evaluate();
  harness.setPathname('/config/site-styles/colors');
  harness.tick();
  harness.setPathname(TARGET_PATH);
  harness.tick();
  harness.tick();
  harness.setPathname('/config/site-styles/fonts');
  harness.tick();
  harness.setPathname('/config/site-styles/colors');
  harness.tick();

  assert.deepEqual(harness.logs, [
    '[Site Styles Search] Font assignment page detected.',
    '[Site Styles Search] Font assignment page exited.',
  ]);
});

test('duplicate evaluation reuses the registered controller', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH });

  harness.evaluate();
  const firstController = harness.parentWindow[CONTROLLER_KEY];
  harness.evaluate();

  assert.equal(harness.parentWindow[CONTROLLER_KEY], firstController);
  assert.equal(harness.intervals.size, 1);
  assert.deepEqual(harness.logs, [
    '[Site Styles Search] Font assignment page detected.',
  ]);
});

test('replaces a legacy route-only controller and mounts the complete interface', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  let destroyCalls = 0;
  const legacyController = {
    destroy() {
      destroyCalls += 1;
      if (harness.parentWindow[CONTROLLER_KEY] === this) {
        delete harness.parentWindow[CONTROLLER_KEY];
      }
    },
  };
  harness.parentWindow[CONTROLLER_KEY] = legacyController;

  harness.evaluate();

  assert.equal(destroyCalls, 1);
  assert.notEqual(harness.parentWindow[CONTROLLER_KEY], legacyController);
  assert.ok(harness.dom.document.getElementById('sn-site-styles-search-input'));
  assert.ok(harness.dom.document.getElementById(COLLAPSE_BUTTON_ID));
});

test('replaces the previous complete build when a newer pasted revision loads', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  let destroyCalls = 0;
  const previousController = {
    buildId: 'site-styles-search-accordions-v7',
    destroy() {
      destroyCalls += 1;
      delete harness.parentWindow[CONTROLLER_KEY];
    },
  };
  harness.parentWindow[CONTROLLER_KEY] = previousController;

  harness.evaluate();

  assert.equal(destroyCalls, 1);
  assert.notEqual(harness.parentWindow[CONTROLLER_KEY], previousController);
  assert.ok(harness.dom.document.getElementById(COLLAPSE_BUTTON_ID));
});

test('does nothing outside an iframe or without readable parent access', () => {
  const topLevelHarness = createBrowserHarness({ iframe: false });
  const inaccessibleHarness = createBrowserHarness({ inaccessibleParent: true });

  topLevelHarness.evaluate();
  inaccessibleHarness.evaluate();

  assert.equal(topLevelHarness.intervals.size, 0);
  assert.equal(topLevelHarness.parentWindow[CONTROLLER_KEY], undefined);
  assert.deepEqual(topLevelHarness.logs, []);
  assert.equal(inaccessibleHarness.intervals.size, 0);
  assert.equal(inaccessibleHarness.parentWindow[CONTROLLER_KEY], undefined);
  assert.deepEqual(inaccessibleHarness.logs, []);
});

test('destroy stops polling and removes the registered controller', () => {
  const harness = createBrowserHarness();

  harness.evaluate();
  const controller = harness.parentWindow[CONTROLLER_KEY];
  controller.destroy();

  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.parentWindow[CONTROLLER_KEY], undefined);

  harness.setPathname(TARGET_PATH);
  harness.tick();
  assert.deepEqual(harness.logs, []);
});

test('section-label match shows the whole matching section', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  search(harness, 'newsletter');

  assert.equal(isHidden(harness.dom.sections[0]), true);
  assert.equal(isHidden(harness.dom.sections[1]), false);
  assert.deepEqual(harness.dom.sections[1].children.slice(1).map(isHidden), [false, false]);
});

test('row-title match keeps its section label and hides nonmatching siblings', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  search(harness, 'title');

  assert.equal(isHidden(harness.dom.sections[0]), false);
  assert.deepEqual(harness.dom.sections[0].children.slice(1).map(isHidden), [false, true]);
  assert.equal(isHidden(harness.dom.sections[1]), false);
  assert.deepEqual(harness.dom.sections[1].children.slice(1).map(isHidden), [false, true]);
});

test('normalizes mixed case and whitespace without matching assigned values', () => {
  const harness = createBrowserHarness({
    pathname: TARGET_PATH,
    sectionDefinitions: [
      EDITOR_SECTIONS[0],
      {
        heading: 'Newsletter Block',
        rows: [
          { title: 'Description', assignedStyle: 'Site Title' },
        ],
      },
    ],
  });
  harness.evaluate();
  search(harness, '  SiTe   TiTlE  ');

  assert.equal(isHidden(harness.dom.sections[0]), false);
  assert.deepEqual(harness.dom.sections[0].children.slice(1).map(isHidden), [false, true]);
  assert.equal(isHidden(harness.dom.sections[1]), true);
  assert.equal(
    harness.dom.document.getElementById('sn-site-styles-search-empty').hasAttribute(HIDDEN_ATTR),
    true,
  );
});

test('assigned style values are not searchable and no-results state clears', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();

  search(harness, 'paragraph');
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-empty').hasAttribute(HIDDEN_ATTR), false);
  assert.ok(harness.dom.sections.every((section) => isHidden(section)));

  search(harness, '');
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-empty').hasAttribute(HIDDEN_ATTR), true);
  assert.ok(harness.dom.sections.every((section) => !isHidden(section)));
});

test('sections start open and toggle with click, Enter, and Space', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  const [{ label, children }] = harness.dom.sections;
  const rows = children.slice(1);

  assert.equal(label.getAttribute('role'), 'button');
  assert.equal(label.getAttribute('tabindex'), '0');
  assert.equal(label.getAttribute('aria-expanded'), 'true');
  assert.ok(rows.every((button) => !isHidden(button)));

  label.dispatchEvent(new FakeEvent('click'));
  assert.equal(label.getAttribute('aria-expanded'), 'false');
  assert.ok(rows.every((button) => isHidden(button)));

  label.dispatchEvent(new FakeEvent('keydown', { key: 'Enter' }));
  assert.equal(label.getAttribute('aria-expanded'), 'true');

  label.dispatchEvent(new FakeEvent('keydown', { key: ' ' }));
  assert.equal(label.getAttribute('aria-expanded'), 'false');
});

test('collapse-all control collapses every section and then expands them', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  const control = harness.dom.document.getElementById(COLLAPSE_BUTTON_ID);

  assert.ok(control);
  assert.equal(control.textContent, 'Collapse all');
  assert.equal(control.hasAttribute('disabled'), false);
  assert.equal(control.hasAttribute(ALL_COLLAPSED_ATTR), false);

  control.dispatchEvent(new FakeEvent('click'));
  assert.ok(harness.dom.sections.every(({ label }) => label.getAttribute('aria-expanded') === 'false'));
  assert.ok(harness.dom.sections.every(({ rows }) => rows.every(({ button }) => isHidden(button))));
  assert.equal(control.textContent, 'Expand all');
  assert.equal(control.hasAttribute(ALL_COLLAPSED_ATTR), true);

  control.dispatchEvent(new FakeEvent('click'));
  assert.ok(harness.dom.sections.every(({ label }) => label.getAttribute('aria-expanded') === 'true'));
  assert.ok(harness.dom.sections.every(({ rows }) => rows.every(({ button }) => !isHidden(button))));
  assert.equal(control.textContent, 'Collapse all');
  assert.equal(control.hasAttribute(ALL_COLLAPSED_ATTR), false);
});

test('collapse-all control is disabled during search and preserves collapsed state', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  const control = harness.dom.document.getElementById(COLLAPSE_BUTTON_ID);
  const newsletter = harness.dom.sections[1];

  assert.ok(control);
  newsletter.label.dispatchEvent(new FakeEvent('click'));
  search(harness, 'title');
  assert.equal(control.hasAttribute('disabled'), true);
  assert.equal(newsletter.label.getAttribute('aria-expanded'), 'true');

  control.dispatchEvent(new FakeEvent('click'));
  search(harness, '');
  assert.equal(control.hasAttribute('disabled'), false);
  assert.equal(newsletter.label.getAttribute('aria-expanded'), 'false');
  assert.equal(harness.dom.sections[0].label.getAttribute('aria-expanded'), 'true');
});

test('search forces matching sections open and clear restores collapsed state', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  const newsletter = harness.dom.sections[1];

  newsletter.label.dispatchEvent(new FakeEvent('click'));
  search(harness, 'title');
  assert.equal(newsletter.label.getAttribute('aria-expanded'), 'true');
  assert.equal(isHidden(newsletter.children[1]), false);

  search(harness, '');
  assert.equal(newsletter.label.getAttribute('aria-expanded'), 'false');
  assert.ok(newsletter.children.slice(1).every((button) => isHidden(button)));
});

test('destroy restores preexisting native label attributes', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  const label = harness.dom.sections[0].label;
  label.setAttribute('role', 'heading');
  label.setAttribute('tabindex', '-1');
  label.setAttribute('aria-expanded', 'false');

  harness.evaluate();
  assert.equal(label.getAttribute('role'), 'button');
  assert.equal(label.getAttribute('tabindex'), '0');
  assert.equal(label.getAttribute('aria-expanded'), 'true');
  harness.parentWindow[CONTROLLER_KEY].destroy();

  assert.equal(label.getAttribute('role'), 'heading');
  assert.equal(label.getAttribute('tabindex'), '-1');
  assert.equal(label.getAttribute('aria-expanded'), 'false');
  assert.equal(label.hasAttribute(SECTION_ATTR), false);
});

test('rehydrates once after React replaces the list without duplicate controls', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  search(harness, 'title');

  harness.dom.replaceList(EDITOR_SECTIONS);
  harness.dom.flushMutations();
  harness.flushTimeouts();

  assert.equal(harness.dom.document.querySelectorAll('input').length, 1);
  assert.equal(harness.dom.sections[0].label.getAttribute('data-sn-site-styles-section'), '');
  assert.deepEqual(harness.dom.sections[0].rows.map(({ button }) => isHidden(button)), [false, true]);
});

test('restores query and collapsed state after nested route navigation', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  const newsletter = harness.dom.sections[1];
  newsletter.label.dispatchEvent(new FakeEvent('click'));
  search(harness, 'site title');

  harness.setPathname(`${TARGET_PATH}/site-title-font`);
  harness.tick();
  harness.dom.replaceList(EDITOR_SECTIONS);
  harness.setPathname(TARGET_PATH);
  harness.tick();

  const input = harness.dom.document.getElementById('sn-site-styles-search-input');
  assert.equal(input.value, 'site title');

  search(harness, '');
  assert.equal(harness.dom.sections[1].label.getAttribute('aria-expanded'), 'false');
});

test('mounts when React renders the assignment list after the return-path poll', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();

  harness.setPathname(`${TARGET_PATH}/site-title-font`);
  harness.tick();
  harness.dom.replaceList([]);
  harness.setPathname(TARGET_PATH);
  harness.tick();

  harness.dom.replaceList(EDITOR_SECTIONS);
  harness.dom.flushMutations();
  harness.flushTimeouts();
  harness.tick();

  assert.ok(harness.dom.document.getElementById('sn-site-styles-search-input'));
  harness.tick();
  assert.equal(harness.dom.document.querySelectorAll('input').length, 1);
  assert.deepEqual(harness.logs, [
    '[Site Styles Search] Font assignment page detected.',
    '[Site Styles Search] Font assignment page exited.',
    '[Site Styles Search] Font assignment page detected.',
  ]);
});

test('destroy removes observers, session state, and native-node changes', () => {
  const harness = createBrowserHarness({ pathname: TARGET_PATH, sectionDefinitions: EDITOR_SECTIONS });
  harness.evaluate();
  const controller = harness.parentWindow[CONTROLLER_KEY];
  search(harness, 'title');
  controller.destroy();

  assert.equal(harness.dom.document.getElementById('sn-site-styles-search'), null);
  assert.equal(harness.dom.document.getElementById('sn-site-styles-search-styles'), null);
  assert.ok(harness.dom.mutationObservers.every((observer) => observer.disconnected));
  assert.ok(harness.dom.sections.every(({ label }) => !label.hasAttribute(SECTION_ATTR)));
  assert.equal(harness.parentWindow[CONTROLLER_KEY], undefined);
});
