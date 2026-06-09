"""Flutter responsive / a11y static audit."""
import os, re, json

ROOT = r"C:\Users\Steven.du\.minimax-agent-cn\projects\studybuddy\app\lib"

# Simple counter patterns
COUNTERS = [
    ("MediaQuery.of", r"MediaQuery\.of\("),
    ("MediaQuery.sizeOf", r"MediaQuery\.sizeOf\("),
    ("LayoutBuilder", r"\bLayoutBuilder\("),
    ("OrientationBuilder", r"\bOrientationBuilder\("),
    ("Expanded", r"\bExpanded\("),
    ("Flexible", r"\bFlexible\("),
    ("Spacer", r"\bSpacer\("),
    ("Wrap", r"\bWrap\("),
    ("SingleChildScrollView", r"\bSingleChildScrollView\("),
    ("SafeArea", r"\bSafeArea\("),
    ("Semantics", r"\bSemantics\("),
    ("Tooltip", r"\bTooltip\("),
    ("IconButton", r"\bIconButton\("),
    ("TextButton", r"\bTextButton\("),
    ("floatingActionButton", r"floatingActionButton:"),
    ("SliverAppBar", r"\bSliverAppBar\("),
    ("context_orientation", r"context\.orientation"),
]

issues = []
stats = {k: 0 for k, _ in COUNTERS}
stats["dart_files"] = 0
stats["semantics_label"] = 0
stats["responsive_files"] = 0

for root, dirs, names in os.walk(ROOT):
    if ".git" in root:
        continue
    for n in names:
        if not n.endswith(".dart"):
            continue
        path = os.path.join(root, n)
        stats["dart_files"] += 1
        with open(path, encoding="utf-8") as f:
            content = f.read()
        for k, pat in COUNTERS:
            stats[k] += len(re.findall(pat, content))
        # Semantics(label: ...) usages
        stats["semantics_label"] += len(re.findall(r"label:\s*['\"]", content))
        # responsive files
        if any(p in content for p in ["LayoutBuilder(", "MediaQuery.sizeOf(", "MediaQuery.of(context).size", "OrientationBuilder(", "MediaQuery.of(context).orientation"]):
            stats["responsive_files"] += 1
        # issues
        lines = content.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # fixed size on SizedBox/Container without breakpoints
            m = re.search(r"(?:SizedBox|Container)\([^)]*(?:width|height):\s*([0-9]+(?:\.[0-9]+)?)\b", stripped)
            if m:
                if "LayoutBuilder" not in content and "MediaQuery" not in content and "screenWidth" not in content:
                    val = float(m.group(1))
                    if val > 200:
                        issues.append({"path": path.replace(ROOT, ""), "kind": "fixed-size-no-breakpoint", "line": i, "snippet": stripped[:120]})
            # Text without overflow handling inside a Row
            if "Text(" in stripped and "overflow:" not in stripped and "maxLines" not in stripped:
                # search backward for Row( on the same or recent lines
                window = "\n".join(lines[max(0, i-8):i])
                if re.search(r"\bRow\(", window):
                    issues.append({"path": path.replace(ROOT, ""), "kind": "text-no-overflow-in-row", "line": i, "snippet": stripped[:120]})

print(json.dumps(stats, indent=2))
print(f"=== responsive-aware files: {stats['responsive_files']} / {stats['dart_files']} ({stats['responsive_files']*100//max(1,stats['dart_files'])}%) ===")
print(f"=== issues: {len(issues)} ===")
counts = {}
for it in issues:
    counts[it["kind"]] = counts.get(it["kind"], 0) + 1
print(f"  by kind: {counts}")
for it in issues[:30]:
    print(f"  [{it['kind']}] {it['path']}:{it['line']} → {it['snippet']}")