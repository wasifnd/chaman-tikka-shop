/** Serializes structured data for a <script type="application/ld+json"> tag. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  // "<" is escaped so content like "</script>" in a product name can't break out of the tag.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
