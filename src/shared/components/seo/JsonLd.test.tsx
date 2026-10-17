// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonLd, serializeJsonLd } from './JsonLd';

afterEach(cleanup);

describe('serializeJsonLd', () => {
  it('produces valid JSON', () => {
    expect(JSON.parse(serializeJsonLd({ '@type': 'Restaurant', name: 'BBQ Store' }))).toEqual({
      '@type': 'Restaurant',
      name: 'BBQ Store',
    });
  });

  it('escapes < so user content cannot close the script tag', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});

describe('JsonLd', () => {
  it('renders a ld+json script', () => {
    const { container } = render(<JsonLd data={{ '@type': 'Restaurant' }} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).toBe('{"@type":"Restaurant"}');
  });
});
