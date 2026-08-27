export class FakeEvent {
  constructor(type, { key = '' } = {}) {
    this.type = type;
    this.key = key;
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

function descendantsOf(element) {
  return element.children.flatMap((child) => [child, ...descendantsOf(child)]);
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.id = '';
    this.type = '';
    this.value = '';
    this.placeholder = '';
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get nextElementSibling() {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return this.parentElement.children[index + 1] || null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  insertBefore(node, referenceNode) {
    node.remove();
    const index = this.children.indexOf(referenceNode);
    node.parentElement = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    return node;
  }

  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name, value = '') {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) {
      listener.call(this, event);
    }
  }

  closest(selector) {
    const tagName = selector.toUpperCase();
    let element = this;
    while (element) {
      if (element.tagName === tagName) return element;
      element = element.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const tagName = selector.toUpperCase();
    return descendantsOf(this).filter((element) => element.tagName === tagName);
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return [this.head, this.body, ...descendantsOf(this.head), ...descendantsOf(this.body)]
      .find((element) => element.id === id) || null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const tagName = selector.toUpperCase();
    return [this.head, this.body, ...descendantsOf(this.head), ...descendantsOf(this.body)]
      .filter((element) => element.tagName === tagName);
  }
}

function createSection(document, definition, index) {
  const section = document.createElement('section');
  section.setAttribute('class', `site-styles-${index}-${Math.random().toString(36).slice(2)}`);
  const rows = [];

  const label = document.createElement('label');
  label.textContent = definition.heading;
  label.setAttribute('class', definition.labelClass || 'editor-section-label');
  section.append(label);
  section.label = label;

  for (const row of definition.rows || []) {
    const button = document.createElement('button');
    const assignedStyle = document.createElement('p');
    assignedStyle.textContent = row.assignedStyle;
    if (row.omitTitleParagraph) {
      button.append(assignedStyle);
    } else {
      const title = document.createElement('p');
      title.textContent = row.title;
      button.append(title, assignedStyle);
    }
    section.append(button);
    rows.push({ button });
  }

  section.rows = rows;

  return section;
}

export function createSiteStylesDomFixture(sectionDefinitions) {
  const document = new FakeDocument();
  const main = document.createElement('main');
  const heading = document.createElement('h1');
  heading.textContent = 'Assign Styles';
  const description = document.createElement('p');
  description.textContent = 'Assign a site style to each text element.';
  let list = document.createElement('div');
  const sections = [];
  const mutationObservers = [];
  let mutationQueued = false;

  main.append(heading, description, list);
  document.body.append(main);

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      mutationObservers.push(this);
    }

    observe(target, options) {
      this.observed.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  function renderList(definitions) {
    const nextList = document.createElement('div');
    const nextSections = definitions.map((definition, index) => createSection(document, definition, index));
    nextList.append(...nextSections);
    return { nextList, nextSections };
  }

  function replaceList(nextDefinitions) {
    const { nextList, nextSections } = renderList(nextDefinitions);
    list.parentElement.insertBefore(nextList, list);
    list.remove();
    list = nextList;
    sections.splice(0, sections.length, ...nextSections);
    mutationQueued = true;
  }

  function flushMutations() {
    if (!mutationQueued) return;
    mutationQueued = false;
    for (const observer of mutationObservers) {
      if (!observer.disconnected) observer.callback([], observer);
    }
  }

  const initial = renderList(sectionDefinitions);
  list.append(...initial.nextSections);
  sections.push(...initial.nextSections);

  return {
    document,
    main,
    heading,
    description,
    get list() {
      return list;
    },
    sections,
    MutationObserver: FakeMutationObserver,
    mutationObservers,
    replaceList,
    flushMutations,
  };
}

function createColorThemeSection(document, definition) {
  const section = document.createElement('div');
  section.setAttribute('class', 'color-theme-section');
  const rows = [];

  const label = document.createElement('h3');
  label.textContent = definition.heading;
  label.setAttribute('class', definition.labelClass || 'color-theme-heading');
  section.append(label);
  section.label = label;

  for (const row of definition.rows || []) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-color-var', row.colorVar || row.title);
    const button = document.createElement('button');
    button.setAttribute('aria-label', row.title);
    const title = document.createElement('p');
    title.textContent = row.title;
    button.append(title);
    wrapper.append(button);
    section.append(wrapper);
    rows.push({ wrapper, button });
  }

  section.rows = rows;
  return section;
}

export function createColorThemeDomFixture(sectionDefinitions, { themePickerHeading = '' } = {}) {
  const document = new FakeDocument();
  const main = document.createElement('main');
  const heading = document.createElement('h1');
  heading.textContent = 'Edit Color Theme';
  const description = document.createElement('p');
  description.textContent = 'Changes affect every section using this color theme.';
  const themePicker = document.createElement('section');
  themePicker.textContent = 'Lightest 1';
  if (themePickerHeading) {
    const unrelatedHeading = document.createElement('h3');
    unrelatedHeading.textContent = themePickerHeading;
    themePicker.append(unrelatedHeading);
  }
  let list = document.createElement('div');
  const sections = [];
  const mutationObservers = [];
  let mutationQueued = false;

  main.append(heading, description, themePicker, list);
  document.body.append(main);

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      mutationObservers.push(this);
    }

    observe(target, options) {
      this.observed.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  function renderList(definitions) {
    const nextList = document.createElement('div');
    const nextSections = definitions.map((definition) => createColorThemeSection(document, definition));
    nextList.append(...nextSections);
    return { nextList, nextSections };
  }

  function replaceList(nextDefinitions) {
    const { nextList, nextSections } = renderList(nextDefinitions);
    list.parentElement.insertBefore(nextList, list);
    list.remove();
    list = nextList;
    sections.splice(0, sections.length, ...nextSections);
    mutationQueued = true;
  }

  function flushMutations() {
    if (!mutationQueued) return;
    mutationQueued = false;
    for (const observer of mutationObservers) {
      if (!observer.disconnected) observer.callback([], observer);
    }
  }

  function queueMutation() {
    mutationQueued = true;
  }

  const initial = renderList(sectionDefinitions);
  list.append(...initial.nextSections);
  sections.push(...initial.nextSections);

  return {
    document,
    main,
    heading,
    description,
    themePicker,
    get list() {
      return list;
    },
    sections,
    MutationObserver: FakeMutationObserver,
    mutationObservers,
    replaceList,
    queueMutation,
    flushMutations,
  };
}

function createImageBlocksSection(document, definition) {
  const label = document.createElement('h2');
  label.textContent = definition.heading;
  label.setAttribute('class', definition.labelClass || 'image-block-heading');
  const rows = [];

  for (const row of definition.rows || []) {
    const wrapper = document.createElement('div');
    const control = document.createElement('div');
    const title = document.createElement('p');
    title.textContent = row.title;
    control.append(title);

    if (row.kind === 'select') {
      control.setAttribute('role', 'combobox');
      const currentValue = document.createElement('p');
      currentValue.textContent = row.currentValue;
      control.append(currentValue);
    } else {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = row.currentValue;
      textInput.setAttribute('aria-label', row.title);
      const rangeInput = document.createElement('input');
      rangeInput.type = 'range';
      rangeInput.value = row.rangeValue || row.currentValue;
      rangeInput.setAttribute('aria-label', row.title);
      control.append(textInput, rangeInput);
    }

    wrapper.append(control);
    rows.push({ wrapper, control });
  }

  return { label, rows };
}

export function createImageBlocksDomFixture(sectionDefinitions) {
  const document = new FakeDocument();
  const main = document.createElement('main');
  const header = document.createElement('div');
  const heading = document.createElement('h1');
  heading.textContent = 'Image Blocks';
  header.append(heading);
  let list = document.createElement('div');
  const sections = [];
  const mutationObservers = [];
  let mutationQueued = false;

  main.append(header, list);
  document.body.append(main);

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      mutationObservers.push(this);
    }

    observe(target, options) {
      this.observed.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  function renderList(definitions) {
    const nextList = document.createElement('div');
    const nextSections = definitions.map((definition) => (
      createImageBlocksSection(document, definition)
    ));
    for (const section of nextSections) {
      nextList.append(section.label, ...section.rows.map(({ wrapper }) => wrapper));
    }
    return { nextList, nextSections };
  }

  function replaceList(nextDefinitions) {
    const { nextList, nextSections } = renderList(nextDefinitions);
    list.parentElement.insertBefore(nextList, list);
    list.remove();
    list = nextList;
    sections.splice(0, sections.length, ...nextSections);
    mutationQueued = true;
  }

  function flushMutations() {
    if (!mutationQueued) return;
    mutationQueued = false;
    for (const observer of mutationObservers) {
      if (!observer.disconnected) observer.callback([], observer);
    }
  }

  const initial = renderList(sectionDefinitions);
  list.append(...initial.nextList.children);
  sections.push(...initial.nextSections);

  return {
    document,
    main,
    heading,
    get list() {
      return list;
    },
    sections,
    MutationObserver: FakeMutationObserver,
    mutationObservers,
    replaceList,
    flushMutations,
  };
}
