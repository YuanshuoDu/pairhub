"""miniprogram responsive / accessibility static audit."""
import os, re, json

ROOT = r"C:\Users\Steven.du\.minimax-agent-cn\projects\studybuddy\miniprogram"
issues = []
stats = {"wxss": 0, "wxml": 0, "rpx": 0, "vh_vw": 0, "flex": 0, "media_query": 0, "fixed_px_css": 0, "fixed_px_attr": 0}

for root, dirs, names in os.walk(ROOT):
    if ".git" in root or "node_modules" in root:
        continue
    for n in names:
        path = os.path.join(root, n)
        if n.endswith(".wxss"):
            stats["wxss"] += 1
            with open(path, encoding="utf-8") as f:
                content = f.read()
            stats["rpx"] += len(re.findall(r"\d+rpx", content))
            stats["vh_vw"] += len(re.findall(r"\d+(?:vh|vw|vmin|vmax)\b", content, re.IGNORECASE))
            stats["flex"] += len(re.findall(r"\b(?:display:\s*flex|flex-direction|justify-content|align-items)\b", content))
            stats["media_query"] += len(re.findall(r"@media\b", content))
            # fixed px in CSS — only flag if it's a layout property, not border/icon size
            for m in re.finditer(r"(width|height|min-width|min-height|max-width|max-height|left|right|top|bottom|margin|padding|font-size|line-height|gap|grid-template-columns|grid-template-rows|border-radius|transform):\s*(\d+)px\b", content):
                prop, val = m.group(1), int(m.group(2))
                if val > 4:  # ignore hairline borders
                    stats["fixed_px_css"] += 1
                    if val > 32:
                        issues.append({"path": path, "kind": "fixed-px-css", "prop": prop, "val": val, "snippet": m.group(0)})
        elif n.endswith(".wxml"):
            stats["wxml"] += 1
            with open(path, encoding="utf-8") as f:
                content = f.read()
            # hardcoded width/height attributes on elements (non-rpx)
            for m in re.finditer(r'(?:width|height)="(\d+)(rpx|px)?"', content):
                unit = m.group(2) or "px"
                if unit == "px":
                    stats["fixed_px_attr"] += 1
                    issues.append({"path": path, "kind": "fixed-px-attr", "snippet": m.group(0)})
            # accessibility checks
            if "<image " in content and "aria-label" not in content and "alt=" not in content:
                # miniprogram <image> doesn't natively support alt; check bindtap for alt-role replacement
                if "bindtap" not in content and "aria-role" not in content:
                    issues.append({"path": path, "kind": "image-no-aria", "snippet": "<image> without aria-label or bindtap (a11y)"})
            # buttons without aria-label when text is icon-only
            for m in re.finditer(r'<button[^>]*>([^<]*)</button>', content):
                inner = m.group(1).strip()
                if not inner and "aria-label" not in m.group(0):
                    issues.append({"path": path, "kind": "button-no-aria", "snippet": m.group(0)[:60]})
            # missing aria-label on interactive non-text elements
            for m in re.finditer(r'<(?:view|cover-view|navigator|scroll-view)[^>]*bindtap=', content):
                if "aria-label" not in m.group(0):
                    issues.append({"path": path, "kind": "tap-no-aria", "snippet": m.group(0)[:80]})

print(json.dumps(stats, indent=2))
print(f"=== issues: {len(issues)} ===")
for it in issues[:30]:
    print(f"  [{it['kind']}] {it['path']}: {it['snippet']}")