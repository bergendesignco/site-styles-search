# Site Styles Search

Adds search and collapsible sections to selected Squarespace Site Styles panels.

Supported panels:

- Font assignments: `/config/site-styles/fonts/assign-styles`
- Color themes: `/config/site-styles/colors/theme-editor`
- Image Blocks: `/config/site-styles/accessories/image-blocks`

The search matches section headings and individual setting labels. Assigned values are intentionally excluded. Sections start open; matching a section heading shows the entire section.

## Install

Add this to **Settings → Advanced → Code Injection → Footer**:

```html
<script src="https://cdn.jsdelivr.net/gh/bergendesignco/site-styles-search@v0.1.0/site-styles-search.js"></script>
```

The versioned URL above is recommended for live sites because it stays fixed. For testing the latest commit from `main`, use:

```html
<script src="https://cdn.jsdelivr.net/gh/bergendesignco/site-styles-search@main/site-styles-search.js"></script>
```

To install the complete script inline instead, copy all of [`site-styles-search.html`](site-styles-search.html) into Footer Code Injection.

## Development

```sh
npm run check
npm run build:code-injection
```

`site-styles-search.js` is the source file. The build command regenerates the paste-ready HTML file.
