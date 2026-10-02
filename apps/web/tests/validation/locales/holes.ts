import assert from "node:assert/strict";
import test, { describe } from "node:test";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { interpolations } from "../../../scripts/interpolations";
import { echoedFill } from "../../../scripts/translation-rules";

const EN = "src/locales/en";
function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(full, ext));
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out;
}
const flat = (o: unknown, p = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v && typeof v === "object") Object.assign(out, flat(v, `${p}${k}.`));
    else if (typeof v === "string") out[`${p}${k}`] = v;
  }
  return out;
};
const dict = new Map<string, Record<string, string>>();
for (const f of files(EN, ".json")) {
  const ns = path.relative(EN, f).replace(/\.json$/, "");
  dict.set(ns, flat(JSON.parse(fs.readFileSync(f, "utf8"))));
}

const LOCALES = "src/locales";
const locales = fs
  .readdirSync(LOCALES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "generated")
  .map((e) => e.name);

/** One namespace in one language, read on demand: the call sites name a handful
 * of namespaces and reading all 352 of them in 36 languages to check seven
 * would cost more than every other test here put together. */
const read = (() => {
  const cache = new Map<string, Record<string, string> | null>();
  return (locale: string, ns: string) => {
    const key = `${locale}/${ns}`;
    if (!cache.has(key)) {
      const file = path.join(LOCALES, locale, `${ns}.json`);
      cache.set(
        key,
        fs.existsSync(file)
          ? flat(JSON.parse(fs.readFileSync(file, "utf8")))
          : null,
      );
    }
    return cache.get(key) ?? null;
  };
})();


/**
 * No key rendering its own braces at a reader.
 *
 * `t("key")` with no values is correct for a plain string and wrong for one
 * carrying a `{placeholder}`: the brace reaches the page verbatim. It is the
 * failure mode of REUSING a key name, which is exactly what happened when a
 * new sentence was written over an existing card label and the support page
 * started announcing "{AMOUNT} COLLECTÉ".
 *
 * `<Interpolate template={t("key")} values={...} />` is the correct shape for a
 * sentence with a hole and is excluded: the component fills them, not the call.
 */
export function holesTests() {
  describe("Locales holes", () => {
    test("no key renders its placeholder at a reader", () => {
      const bad: string[] = [];

  for (const file of files("src", ".tsx").concat(files("src", ".ts"))) {
    const text = fs.readFileSync(file, "utf8");
    if (!/(use|get)Translation\(/.test(text)) continue;
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    // binding name -> namespace
    const bindings = new Map<string, string>();
    const collect = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        let init: ts.Node = n.initializer;
        if (ts.isAwaitExpression(init)) init = init.expression;
        if (ts.isCallExpression(init) && /^(use|get)Translation$/.test(init.expression.getText())) {
          const arg = init.arguments[0];
          if (arg && ts.isStringLiteral(arg) && ts.isObjectBindingPattern(n.name)) {
            for (const el of n.name.elements)
              if (el.propertyName?.getText() === "t" || el.name.getText() === "t")
                bindings.set(el.name.getText(), arg.text);
          }
        }
      }
      ts.forEachChild(n, collect);
    };
    collect(src);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && bindings.has(n.expression.text)) {
        const key = n.arguments[0];
        // `<Interpolate template={t("key")} values={...} />` is the correct shape:
        // the holes are filled by the component, not by the call.
        const asTemplate =
          n.parent &&
          ts.isJsxExpression(n.parent) &&
          n.parent.parent &&
          ts.isJsxAttribute(n.parent.parent) &&
          n.parent.parent.name.getText() === "template";
        if (key && ts.isStringLiteral(key) && n.arguments.length === 1 && !asTemplate) {
          const value = dict.get(bindings.get(n.expression.text)!)?.[key.text];
          if (value && /\{[^{}]+\}/.test(value)) {
            const line = src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
            bad.push(`${file}:${line}\t${n.expression.text}("${key.text}") -> ${value.slice(0, 70)}`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
      assert.deepStrictEqual(
        bad,
        [],
        "These call sites pass no values for a key that has holes. Pass them, or give the sentence a key of its own.",
      );
    });

    test("no translation spells out the word its own placeholder supplies", () => {
      const bad: string[] = [];
      for (const { template, fills } of interpolations("src")) {
        for (const locale of locales) {
          if (locale === "en") continue;
          const sentence = read(locale, template.ns)?.[template.key];
          if (typeof sentence !== "string") continue;
          const words = fills.flatMap((fill) => {
            const word = read(locale, fill.ns)?.[fill.key];
            return typeof word === "string" ? [{ hole: fill.hole, word }] : [];
          });
          const echo = echoedFill(sentence, words);
          if (echo)
            bad.push(
              `${locale}/${template.ns}: ${template.key} = "${sentence}" also spells out {${echo.hole}} ("${echo.word}")`,
            );
        }
      }
      assert.deepStrictEqual(
        bad,
        [],
        "These translations write out the word their own placeholder already fills in, so a reader gets it twice. Build the sentence around the hole.",
      );
    });
  });
}
