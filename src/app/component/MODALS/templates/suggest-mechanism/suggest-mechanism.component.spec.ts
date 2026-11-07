import { TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MailService } from 'src/app/services/mail.service';
import { NotificationOptions, NotificationService } from 'src/app/services/notification.service';
import { TEMPLATE_LINKAGES } from '../template-linkages';
import { SuggestMechanismComponent } from './suggest-mechanism.component';
import { blankSuggestion, SentSuggestion } from './suggestion';

describe('Suggest a Mechanism, sending', () => {
  let said: { kind: string; id: string; text: string; options?: NotificationOptions }[];
  let outcome: () => Promise<'sent' | 'no-key'>;
  let mailed: Record<string, string>[];

  beforeEach(async () => {
    said = [];
    mailed = [];
    const record = (kind: string) => (id: string, text: string, options?: NotificationOptions) =>
      said.push({ kind, id, text, options });
    await TestBed.configureTestingModule({
      imports: [SuggestMechanismComponent],
      providers: [
        provideAnimations(),
        {
          provide: NotificationService,
          useValue: {
            refusal: record('refusal'),
            failure: record('failure'),
            success: record('success'),
            dismissId: () => undefined,
          },
        },
        {
          provide: MailService,
          useValue: {
            send: (_template: string, params: Record<string, string>) => {
              mailed.push(params);
              return outcome();
            },
            diagnostics: () => 'Browser: test',
          },
        },
      ],
    }).compileComponents();
  });

  function open() {
    const fixture = TestBed.createComponent(SuggestMechanismComponent);
    const form = blankSuggestion();
    fixture.componentRef.setInput('form', form);
    fixture.detectChanges();
    const sent: SentSuggestion[] = [];
    fixture.componentInstance.sent.subscribe((one) => sent.push(one));
    return { fixture, form, component: fixture.componentInstance, sent };
  }

  function fillIn(form: ReturnType<typeof blankSuggestion>) {
    form.controls.link.setValue(`https://app.pmksplus.com/?${TEMPLATE_LINKAGES['Pantograph']}`);
    form.controls.title.setValue('Hoeken’s Straight-Line');
    form.controls.description.setValue('A crank-rocker whose coupler tip runs nearly straight.');
    form.controls.credit.setValue('Pat Lee');
    form.controls.consent.setValue(true);
  }

  it('offers only a link when the grid is empty, and says why', () => {
    const { fixture, component } = open();
    expect(component.source).toBe('pasted-link');
    expect(fixture.nativeElement.textContent).toContain('Nothing on the grid yet.');
  });

  it('refuses a blank form by naming every field to fix, and sends nothing', async () => {
    const { component } = open();
    outcome = () => Promise.resolve('sent');
    await component.send();
    expect(mailed.length).toBe(0);
    expect(said).toEqual([
      expect.objectContaining({
        kind: 'refusal',
        id: 'suggest.incomplete',
        text: 'Four things to fix before this can send: the link, the title, the description and the permission box.',
      }),
    ]);
  });

  it('sends a complete suggestion and hands over what went', async () => {
    const { form, component, sent } = open();
    fillIn(form);
    outcome = () => Promise.resolve('sent');
    await component.send();
    expect(said).toEqual([]);
    expect(mailed.length).toBe(1);
    expect(mailed[0]['source']).toBe('pasted-link');
    expect(mailed[0]['credit']).toBe('Pat Lee');
    expect(sent.length).toBe(1);
    expect(sent[0].title).toBe('Hoeken’s Straight-Line');
    expect(component.sending).toBe(false);
    // Left as typed: only Suggest Another clears it.
    expect(form.controls.title.value).toBe('Hoeken’s Straight-Line');
  });

  it('says the build cannot send, with the address to write to instead', async () => {
    const { form, component, sent } = open();
    fillIn(form);
    outcome = () => Promise.resolve('no-key');
    await component.send();
    expect(sent.length).toBe(0);
    expect(said[0].id).toBe('suggest.no-key');
    expect(said[0].text).toContain('help@pmksplus.com');
  });

  it('keeps everything when a send fails, and offers to try again', async () => {
    const { form, component, sent } = open();
    fillIn(form);
    outcome = () => Promise.reject(new Error('412'));
    await component.send();
    expect(sent.length).toBe(0);
    expect(said[0].id).toBe('suggest.send-failed');
    expect(said[0].text).toBe('The suggestion did not send. Everything you typed is still here.');
    expect(said[0].options?.actions?.[0].label).toBe('Try again');
    expect(form.controls.description.value).toContain('crank-rocker');
    expect(component.sending).toBe(false);
  });
});
