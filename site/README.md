# Modern Web Guidance Atlas

A single-page site that shows every guide in the `modern-web-guidance` and
`chrome-extensions` skills: search, filter by Baseline browser readiness, and read
each guide in full.

Guides with a hand-built **live demo** have a file in `site/demos/<guide-id>.html`: an HTML
fragment (style, markup, script) that runs inside `site/demo-base.html`, a sandboxed frame with
the site's colours and small fallbacks for Invoker Commands, `closedby`, `focusgroup` and
`interestfor`. A demo that needs more room for an overlay adds
`<div data-demo-min-height="400" hidden></div>`.

`index.html` is generated. To rebuild after updating the skills:

```sh
npx -y modern-web-guidance@latest list > site/guide-list.json
python3 site/build.py skills site/guide-list.json site/template.html site/index.html
```

The generated `index.html` has no `<html>`/`<head>` wrapper because it's published as a
claude.ai Artifact, which adds one.
