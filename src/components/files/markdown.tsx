import { Fragment, type ReactNode } from 'react';

// A small Markdown renderer for previews: headings, lists, quotes, code,
// emphasis and links. It builds React elements, so file contents are never
// inserted as HTML.

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/;
  let rest = text;
  let i = key;
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) {
      out.push(rest);
      break;
    }
    if (match.index > 0) out.push(rest.slice(0, match.index));
    const token = match[0];
    if (match[1]) out.push(<code key={i++} className='rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]'>{token.slice(1, -1)}</code>);
    else if (match[2]) out.push(<strong key={i++}>{inline(token.slice(2, -2), i * 100)}</strong>);
    else if (match[3]) out.push(<em key={i++}>{inline(token.slice(1, -1), i * 100)}</em>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      const safe = /^(https?:|mailto:|#|\/)/i.test(href) ? href : undefined;
      out.push(
        <a key={i++} href={safe} target='_blank' rel='noopener noreferrer nofollow' className='text-primary underline underline-offset-2'>
          {label}
        </a>
      );
    }
    rest = rest.slice(match.index + token.length);
  }
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={blocks.length} className='overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm'>
          {code.join('\n')}
        </pre>
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = ['text-3xl', 'text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm'][level - 1];
      blocks.push(
        <p key={blocks.length} role='heading' aria-level={level} className={`${size} mt-6 mb-2 font-semibold first:mt-0`}>
          {inline(heading[2])}
        </p>
      );
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const entries: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i]))
        entries.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={blocks.length} className={`my-3 space-y-1 pl-6 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {entries.map((entry, n) => <li key={n}>{inline(entry)}</li>)}
        </List>
      );
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={blocks.length} className='my-3 border-l-4 pl-4 text-muted-foreground'>
          {inline(quote.join(' '))}
        </blockquote>
      );
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={blocks.length} className='my-6' />);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s)/.test(lines[i]))
      paragraph.push(lines[i++]);
    blocks.push(
      <p key={blocks.length} className='my-3 leading-7'>
        {paragraph.map((text, n) => (
          <Fragment key={n}>
            {n > 0 && ' '}
            {inline(text)}
          </Fragment>
        ))}
      </p>
    );
  }
  return <div className='text-[15px]'>{blocks}</div>;
}
