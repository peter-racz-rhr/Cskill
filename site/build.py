#!/usr/bin/env python3
"""Build the Modern Web Guidance explorer: one HTML page with every guide embedded.

Usage: python3 build.py <skills-dir> <list.json> <template.html> <out.html>
"""
import json
import re
import sys
from pathlib import Path

skills_dir, list_json, template, out = map(Path, sys.argv[1:5])
mwg = skills_dir / "modern-web-guidance"
ext = skills_dir / "chrome-extensions"

descriptions = {d["id"]: d["description"] for d in json.loads(list_json.read_text())}

CATEGORY_NAMES = {
    "accessibility": "Accessibility", "built-in-ai": "Built-in AI", "css": "CSS",
    "forms": "Forms", "html": "HTML", "js": "JavaScript", "performance": "Performance",
    "privacy": "Privacy", "pwa": "Progressive Web Apps", "security": "Security",
    "ui-atoms": "UI atoms", "ui-behaviors": "UI behaviors", "ui-components": "UI components",
    "user-experience": "User experience", "visual-design": "Visual design",
    "wasm": "WebAssembly", "webmcp": "WebMCP",
    "ext-extensions": "Extension APIs", "ext-webstore": "Web Store publishing",
    "skill": "The skills themselves",
}

STATUS_RE = re.compile(
    r"(?:Baseline status|Browser support) for (.+?): "
    r"(Widely available|Newly available|Limited availability)"
    r"(?:\. It's been Baseline since (\d{4}-\d{2}-\d{2}))?"
)
STATUS_KEY = {"Widely available": "widely", "Newly available": "newly", "Limited availability": "limited"}


def strip_front_matter(text):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4:].lstrip("\n")
    return text


def first_paragraph(md):
    for block in re.split(r"\n\s*\n", md):
        b = block.strip()
        if b and not b.startswith(("#", "```", "|", "-", "*", ">", "<")):
            return re.sub(r"\s+", " ", re.sub(r"[`*_]", "", b))[:260]
    return ""


def features(md):
    seen = {}
    for name, status, since in STATUS_RE.findall(md):
        name = re.sub(r"^the (api|css|html|javascript|http)\.", "", name).replace(" capability", "")
        seen.setdefault(name, {"name": name, "status": STATUS_KEY[status], "since": since or None})
    return list(seen.values())


def doc(doc_id, category, path, group):
    raw = path.read_text(encoding="utf-8")
    md = strip_front_matter(raw)
    m = re.search(r"^#\s+(.+)$", md, re.M)
    title = m.group(1).strip() if m else doc_id.replace("-", " ").capitalize()
    fm_desc = re.search(r"^description:\s*[>|]?\s*\n?((?:\s{2,}.+\n?)+|.+)", raw, re.M) if raw.startswith("---") else None
    desc = descriptions.get(doc_id) or (re.sub(r"\s+", " ", fm_desc.group(1)).strip() if fm_desc else "") or first_paragraph(md)
    return {
        "id": doc_id, "cat": category, "group": group, "title": title, "desc": desc,
        "words": len(re.findall(r"\w+", md)), "features": features(md), "md": md,
    }


docs = []
for f in sorted((mwg / "guides").rglob("*.md")):
    docs.append(doc(f.stem, f.parent.name, f, "mwg"))
for f in sorted((ext / "references").rglob("*.md")):
    docs.append(doc("ext-" + f.stem, "ext-" + f.parent.name, f, "ext"))
docs.append(doc("skill-modern-web-guidance", "skill", mwg / "SKILL.md", "skill"))
docs.append(doc("skill-chrome-extensions", "skill", ext / "SKILL.md", "skill"))
docs[-2]["title"] = "Modern Web Guidance: the skill file"
docs[-1]["title"] = "Chrome Extensions: the skill file"

reserved = {"settings", "sidebar", "customize", "upgrade", "downloads"}
assert not any(d["id"] in reserved or d["id"].startswith("comment-") for d in docs)
assert len({d["id"] for d in docs}) == len(docs), "duplicate ids"

cats = []
for d in docs:
    if d["cat"] not in [c["id"] for c in cats]:
        cats.append({"id": d["cat"], "name": CATEGORY_NAMES.get(d["cat"], d["cat"]), "group": d["group"]})

demo_dir = out.parent / "demos"
demo_base = (out.parent / "demo-base.html").read_text(encoding="utf-8")
ids = {d["id"] for d in docs}
for f in sorted(demo_dir.glob("*.html")):
    assert f.stem in ids, f"demo for unknown guide: {f.stem}"
for d in docs:
    f = demo_dir / f"{d['id']}.html"
    d["demo"] = f.read_text(encoding="utf-8").strip() if f.exists() else None

payload = json.dumps({"docs": docs, "cats": cats, "demoBase": demo_base}, ensure_ascii=False, separators=(",", ":"))
payload = payload.replace("<", "\\u003c")
html = template.read_text(encoding="utf-8").replace("/*__DATA__*/", payload)
out.write_text(html, encoding="utf-8")

feats = [f for d in docs for f in d["features"]]
print(f"{sum(1 for d in docs if d['demo'])} demos, {len(docs)} docs, {len(cats)} categories, {len(feats)} feature statuses, "
      f"{sum(d['words'] for d in docs):,} words, {out.stat().st_size/1e6:.2f} MB")
