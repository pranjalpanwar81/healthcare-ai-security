import React from 'react';

function formatInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.replace(/\*\*/g, '')
  );
}

export default function FormattedAIText({ text = '', className = '' }) {
  const normalized = String(text)
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+(?=#{1,3}\s)/g, '\n')
    .replace(/[ \t]+(?=(?:[*-])\s+\*\*[^*]+\*\*)/g, '\n')
    .replace(/[ \t]+(?=\*\*[^*]{2,60}\*\*(?:\s|:|$))/g, '\n')
    .replace(/---\s*(?=#{1,3}\s)/g, '\n');
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const blocks = [];
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {bullets.map((item, index) => <li key={index}>{formatInline(item)}</li>)}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line, index) => {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    const boldHeading = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    flushBullets();
    if (heading) {
      blocks.push(<h4 key={`heading-${index}`}>{formatInline(heading[1])}</h4>);
    } else if (boldHeading && boldHeading[2]) {
      blocks.push(<p key={`paragraph-${index}`}><strong>{boldHeading[1]}</strong> {formatInline(boldHeading[2])}</p>);
    } else if (boldHeading) {
      blocks.push(<h4 key={`heading-${index}`}>{boldHeading[1]}</h4>);
    } else {
      blocks.push(<p key={`paragraph-${index}`}>{formatInline(line.replace(/\*\*/g, '').replace(/\s+---\s+/g, ' '))}</p>);
    }
  });
  flushBullets();

  return <div className={`formatted-ai-text ${className}`.trim()}>{blocks}</div>;
}
