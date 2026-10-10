import Markdown, { type Components } from 'react-markdown';

// Answers are written from other people's email and Slack text, so treat
// the markdown as untrusted: raw HTML is dropped, images are never rendered
// (an injected image URL would load on its own), and links open in a new
// tab without a referrer. react-markdown's default urlTransform already
// limits links to http(s)/mailto and friends.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-paper px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline underline-offset-2 hover:text-ink-muted"
    >
      {children}
    </a>
  ),
};

export function AnswerMarkdown({ text }: { text: string }) {
  return (
    <div className="text-sm text-ink">
      <Markdown components={components} disallowedElements={['img']} unwrapDisallowed skipHtml>
        {text}
      </Markdown>
    </div>
  );
}
