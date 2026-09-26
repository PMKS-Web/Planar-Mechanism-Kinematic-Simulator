import { WHAT_IS_THIS_VERSION, WhatIsThisReply } from '../../model/what-is-this/prompt';
import { NoteStore } from './note-store';

const reply = (plainEnglish: string): WhatIsThisReply => ({
  plainEnglish,
  resembles: '',
  useCases: [],
  terms: [],
});

describe('NoteStore', () => {
  const realFetch = globalThis.fetch;
  const serve = (body: unknown) =>
    (globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(body)))) as typeof fetch);

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
  });

  it('keeps a note for the next visit', () => {
    new NoteStore().keep('k1', reply('One.'));
    expect(new NoteStore().get('k1')?.plainEnglish).toBe('One.');
  });

  it('keeps the latest sixty, dropping the oldest', () => {
    const store = new NoteStore();
    for (let i = 0; i < 65; i++) store.keep(`k${i}`, reply(`Note ${i}.`));
    const later = new NoteStore();
    expect(later.get('k0')).toBeUndefined();
    expect(later.get('k4')).toBeUndefined();
    expect(later.get('k5')?.plainEnglish).toBe('Note 5.');
    expect(later.get('k64')?.plainEnglish).toBe('Note 64.');
  });

  it('adds the library’s notes, once, when they are for this prompt', async () => {
    serve({ version: WHAT_IS_THIS_VERSION, notes: { lib: reply('Shipped.'), bad: { x: 1 } } });
    const store = new NoteStore();
    await store.loadLibrary();
    expect(store.get('lib')?.plainEnglish).toBe('Shipped.');
    expect(store.get('bad')).toBeUndefined();
  });

  it('ignores a library written for another prompt', async () => {
    serve({ version: 'v0', notes: { lib: reply('Old.') } });
    const store = new NoteStore();
    await store.loadLibrary();
    expect(store.get('lib')).toBeUndefined();
  });

  it('carries on without a library it cannot fetch', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    const store = new NoteStore();
    await expect(store.loadLibrary()).resolves.toBeUndefined();
  });
});
