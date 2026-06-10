/**
 * Custom stylelint plugin: studybuddy/no-rule-before-import
 *
 * Warns when a WXSS file contains a CSS rule (selector + declarations) that
 * appears BEFORE the first `@import` statement.
 *
 * Rationale: in CSS / WXSS, any rule declared before `@import` cannot use
 * tokens (custom properties / mixins) defined in the imported stylesheet.
 * The StudyBuddy design system contract is: tokens.wxss is the canonical
 * source of design tokens, imported once at the top of app.wxss. Any rule
 * before that import would silently lose token-driven styling.
 *
 * Behavior:
 *   - If the file has NO `@import` at all, the rule does NOT fire
 *     (token-only files like styles/tokens.wxss itself are exempt).
 *   - If the file has at least one `@import`, every rule whose source
 *     position is before the first `@import` produces a warning.
 *   - Comments and @charset / @namespace etc. are allowed before @import.
 *   - Rules nested inside @media / @supports etc. are ignored — they
 *     naturally execute after their parent's @import chain.
 *
 * Severity is configurable via the standard stylelint `severity` secondary
 * option (defaults to "warning"); we do not turn it into an error because
 * pre-existing WXSS in this repo had no `@import` to position-check, and
 * we want the lint to be informational rather than blocking on first
 * rollout.
 */

import stylelint from 'stylelint';

const ruleName = 'studybuddy/no-rule-before-import';
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (firstImportLine) =>
    `Rule appears before the first @import (line ${firstImportLine}). ` +
    `Move @import to the top of the file so rules can reference its tokens.`,
});

const meta = {
  url: 'https://github.com/YuanshuoDu/studybuddy/blob/main/miniprogram/scripts/stylelint-plugin-import-first.mjs',
};

/** Walk the top-level root nodes and return the first @import node, if any. */
function findFirstImport(root) {
  if (!root.nodes) return null;
  for (const node of root.nodes) {
    if (node && node.type === 'atrule' && node.name === 'import') {
      return node;
    }
    // Comments, @charset, @namespace etc. don't disqualify the file —
    // keep scanning until we hit an @import or a rule.
  }
  return null;
}

function isTopLevel(rule, root) {
  let parent = rule.parent;
  while (parent && parent !== root) {
    return false;
  }
  return true;
}

const ruleFunction = (primary, _secondaryOptions, _context) => {
  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });
    if (!validOptions) return;

    const firstImport = findFirstImport(root);
    if (!firstImport) return; // no @import → nothing to position-check

    const firstImportLine =
      firstImport.source && firstImport.source.start
        ? firstImport.source.start.line
        : 0;

    root.walkRules((rule) => {
      if (!isTopLevel(rule, root)) return;

      const ruleLine =
        rule.source && rule.source.start ? rule.source.start.line : 0;
      if (ruleLine && ruleLine < firstImportLine) {
        stylelint.utils.report({
          message: messages.rejected(firstImportLine),
          node: rule,
          result,
          ruleName,
        });
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default stylelint.createPlugin(ruleName, ruleFunction);
export { ruleName, messages, meta };