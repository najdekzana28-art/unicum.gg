/**
 * Where the site builds one sentence out of two keys, read off the call sites.
 *
 * `<Interpolate template={t("heading")} values={{ badge: t("heading-accent") }} />`
 * is a sentence with a hole and the key that fills it, and the pair only exists
 * in the component: neither locale file can see that it is half of something.
 * Both the writer (`generate-translations.ts`) and the checker
 * (`tests/validation/locales/holes.ts`) need to know, so it is derived here
 * once rather than listed in two places that would drift.
 *
 * The TypeScript AST rather than a regular expression, which was tried first
 * and silently read three of the eight call sites on the site: a `values` block
 * holding markup around its call, or spread across enough lines, falls outside
 * any pattern worth writing.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

/** One key in one namespace, when both are written out in the source. */
export type TranslationRef = { ns: string; key: string };

/** A hole in a sentence, and the key whose value lands in it. */
export type Fill = TranslationRef & { hole: string };

export type Interpolation = {
  file: string;
  template: TranslationRef;
  fills: Fill[];
};

/** Which namespace each `t`-like binding in one file reads from. */
function namespaceBindings(source: ts.SourceFile): Map<string, string> {
  const bindings = new Map<string, string>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let init: ts.Node = node.initializer;
      if (ts.isAwaitExpression(init)) init = init.expression;
      if (
        ts.isCallExpression(init) &&
        /^(use|get)Translation$/.test(init.expression.getText())
      ) {
        const arg = init.arguments[0];
        if (
          arg &&
          ts.isStringLiteral(arg) &&
          ts.isObjectBindingPattern(node.name)
        ) {
          for (const element of node.name.elements)
            if (
              element.propertyName?.getText() === "t" ||
              element.name.getText() === "t"
            )
              bindings.set(element.name.getText(), arg.text);
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  return bindings;
}

/**
 * The key a `t`-like call reads, when both its binding and its key are written
 * out.
 *
 * A computed key (`clan-boards.${board}`) resolves to nothing, and nothing is
 * the honest answer: which string fills that hole is decided at runtime, so
 * there is no pair to hold a translation to.
 */
function translationKey(
  node: ts.Node,
  bindings: Map<string, string>,
): TranslationRef | undefined {
  let found: TranslationRef | undefined;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      const ns = bindings.get(child.expression.text);
      const arg = child.arguments[0];
      if (ns && arg && ts.isStringLiteral(arg)) {
        found = { ns, key: arg.text };
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "locales" && entry.name !== "generated")
        out.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Every sentence on the site that is assembled from a template and the keys
 * filling its holes. `root` is the `src` directory to read. */
export function interpolations(root: string): Interpolation[] {
  const out: Interpolation[] = [];
  for (const file of sourceFiles(root)) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("<Interpolate")) continue;
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const bindings = namespaceBindings(source);
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        node.tagName.getText() === "Interpolate"
      ) {
        let template: TranslationRef | undefined;
        const fills: Fill[] = [];
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
          if (!ts.isJsxExpression(attribute.initializer)) continue;
          const expression = attribute.initializer.expression;
          if (!expression) continue;
          const name = attribute.name.getText();
          if (name === "template")
            template = translationKey(expression, bindings);
          if (name === "values" && ts.isObjectLiteralExpression(expression))
            for (const property of expression.properties) {
              if (!ts.isPropertyAssignment(property)) continue;
              const ref = translationKey(property.initializer, bindings);
              if (ref) fills.push({ hole: property.name.getText(), ...ref });
            }
        }
        if (template && fills.length > 0) out.push({ file, template, fills });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}
