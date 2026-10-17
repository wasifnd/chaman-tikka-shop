import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import messages from './messages/en.json';

/**
 * Every text key used in the code must exist in the English messages. A missing key would not
 * fail the build; it would show up as a raw key name on a live screen (or crash a page), so
 * this scans the source for translator calls and checks each literal key.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const lookup = (dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, messages);

/** Splits "a(), [b, c], d" at the commas that are not inside brackets. */
function topLevelItems(source: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of source) {
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

/** variable name -> namespaces it is bound to anywhere in the file */
function translators(source: string): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const add = (name: string, namespace: string) => {
    found.set(name, (found.get(name) ?? new Set<string>()).add(namespace));
  };

  for (const m of source.matchAll(
    /const (\w+) = (?:await )?(?:useTranslations|getTranslations)\('([^']+)'\)/g,
  )) {
    add(m[1] ?? '', m[2] ?? '');
  }

  // const [t, rows] = await Promise.all([getTranslations('ns'), load()]);
  for (const m of source.matchAll(/const \[([^\]]+)\] = await Promise\.all\(\[([\s\S]*?)\]\);/g)) {
    const names = topLevelItems(m[1] ?? '');
    const calls = topLevelItems(m[2] ?? '');
    names.forEach((name, index) => {
      const namespace = /^getTranslations\('([^']+)'\)/.exec(calls[index] ?? '')?.[1];
      if (namespace) add(name, namespace);
    });
  }
  return found;
}

describe('translation keys', () => {
  const files = sourceFiles(path.join(process.cwd(), 'src'));

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('are all present in the English messages', () => {
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [name, namespaces] of translators(source)) {
        const call = new RegExp(`(?<![\\w.])${name}\\(\\s*(['\`])([^'\`]+)\\1`, 'g');
        for (const m of source.matchAll(call)) {
          const key = m[2] ?? '';
          // A key built at run time (a template, or 'type.' + value) must at least point at an
          // existing group of messages.
          const [fixed = '', dynamic] = key.split('${');
          const buildsAtRunTime = dynamic !== undefined || key.endsWith('.');
          const wanted = buildsAtRunTime ? fixed.replace(/.$/, '') : key;
          const exists = [...namespaces].some(
            (ns) => lookup(wanted ? `${ns}.${wanted}` : ns) !== undefined,
          );
          if (!exists)
            missing.push(
              `${path.relative(process.cwd(), file)}: ${[...namespaces].join('|')} ${key}`,
            );
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every dynamic group is a non-empty group of messages', () => {
    for (const path of [
      'admin.team.roles',
      'admin.products.stockStatus',
      'admin.deals.state',
      'admin.settings.days',
      'admin.orders.status',
      'admin.orders.type',
      'admin.orders.payment',
      'admin.orders.method',
    ]) {
      const group = lookup(path);
      expect(typeof group === 'object' && group !== null && Object.keys(group).length > 0).toBe(
        true,
      );
    }
  });
});
