import { GuideLink } from './guide-link';

const propsOf = (href: string) =>
  GuideLink({ href, children: 'x' }).props as Record<string, unknown>;

describe('GuideLink', () => {
  it('lets an in-page anchor scroll the page it is on', () => {
    expect(propsOf('#layout')['target']).toBe('_self');
  });

  it('loads another gallery page in the top window', () => {
    expect(propsOf('./?path=/docs/guides-vocabulary--docs#voice')['target']).toBe('_top');
  });

  it('opens anything else in a new tab', () => {
    const props = propsOf('https://github.com/PMKS-Web/x/blob/staging/README.md');
    expect(props['target']).toBe('_blank');
    expect(props['rel']).toBe('noreferrer');
  });
});
