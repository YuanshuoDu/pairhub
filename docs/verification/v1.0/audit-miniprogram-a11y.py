"""miniprogram a11y audit v2 — only icon-only interactive elements."""
import os, re, json

ROOT = r"C:\Users\Steven.du\.minimax-agent-cn\projects\studybuddy\miniprogram"
issues = []

for root, dirs, names in os.walk(ROOT):
    if ".git" in root or "node_modules" in root:
        continue
    for n in names:
        if not n.endswith(".wxml"):
            continue
        path = os.path.join(root, n)
        with open(path, encoding="utf-8") as f:
            content = f.read()
        # split into top-level <view>...</view> blocks that have bindtap
        for m in re.finditer(r'<view([^>]*)>([\s\S]*?)</view>', content):
            attrs = m.group(1)
            inner = m.group(2).strip()
            if "bindtap" not in attrs:
                continue
            # check for aria-label
            if "aria-label" in attrs:
                continue
            # check for aria-role
            if 'aria-role="button"' in attrs:
                continue
            # check for visible text content
            # strip nested tags to get text
            text_only = re.sub(r"<[^>]+>", "", inner).strip()
            # also check if class has aria-label-providing info (e.g. tabbar item uses list item label)
            # consider it OK if it has visible text OR inner has nested text-bearing element
            has_text = bool(text_only) or bool(re.search(r"<text[\s>]", inner))
            if not has_text:
                # show the actual attrs + the parent class context for diagnosis
                issues.append({"path": path.replace(ROOT, ""), "attrs": attrs[:200].strip(), "inner": inner[:80].strip()})

# dedup by (path, attrs)
seen = set()
unique = []
for it in issues:
    key = (it["path"], it["attrs"])
    if key in seen:
        continue
    seen.add(key)
    unique.append(it)

print(f"=== icon-only interactive elements WITHOUT aria-label: {len(unique)} ===")
for it in unique[:40]:
    print(f"  {it['path']}")
    print(f"    attrs: {it['attrs']}")
    print(f"    inner: {it['inner']}")
    print()