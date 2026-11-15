# Modern Web Guidance Atlas

A single-page site that shows every guide in the `modern-web-guidance` and
`chrome-extensions` skills: search, filter by Baseline browser readiness, and read
each guide in full.

`index.html` is generated. To rebuild after updating the skills:

```sh
npx -y modern-web-guidance@latest list > site/guide-list.json
python3 site/build.py skills site/guide-list.json site/template.html site/index.html
```

The generated `index.html` has no `<html>`/`<head>` wrapper because it's published as a
claude.ai Artifact, which adds one.
