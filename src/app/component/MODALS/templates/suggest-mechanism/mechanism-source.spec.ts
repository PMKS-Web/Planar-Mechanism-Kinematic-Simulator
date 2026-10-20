import { isPmksHost, readPastedLink } from './mechanism-source';
import { TEMPLATE_LINKAGES } from '../template-linkages';
import { SettingsService } from '../../../../services/settings.service';
import { MODEL_SCALE } from '../../../../model/render-scale';

describe('a pasted link', () => {
  const here = 'localhost';
  const fourBar = `https://app.pmksplus.com/?${TEMPLATE_LINKAGES['4-Bar']}`;

  it('accepts production, either Netlify site and a local server, and nothing else', () => {
    expect(isPmksHost('app.pmksplus.com', here)).toBe(true);
    expect(isPmksHost('deploy-preview-42--pmksnew.netlify.app', here)).toBe(true);
    expect(isPmksHost('staging--pmksprod.netlify.app', here)).toBe(true);
    expect(isPmksHost('localhost', 'example.org')).toBe(true);
    expect(isPmksHost('www.youtube.com', here)).toBe(false);
    expect(isPmksHost('pmksnew.netlify.app.evil.com', here)).toBe(false);
  });

  it('is nothing while it is empty', () => {
    expect(readPastedLink('   ', here).kind).toBe('empty');
  });

  it('is not a PMKS+ link when it is somebody else’s, or only the front door', () => {
    expect(readPastedLink('https://www.youtube.com/watch?v=hoeken', here).kind).toBe('foreign');
    expect(readPastedLink('not a link at all', here).kind).toBe('foreign');
    expect(readPastedLink('https://app.pmksplus.com/', here).kind).toBe('foreign');
    expect(readPastedLink('https://app.pmksplus.com/?utm_source=x', here).kind).toBe('foreign');
  });

  it('is cut short when a PMKS+ link will not decode', () => {
    expect(readPastedLink(fourBar.slice(0, 60), here).kind).toBe('broken');
  });

  it('reads a cylinder at the link’s own size, not the open drawing’s', () => {
    const held = SettingsService.preservedCylinderScale;
    // A fresh grid, whose cylinders follow its own object size rather than
    // the landing gear's.
    SettingsService.preservedCylinderScale = 0;
    try {
      const read = readPastedLink(
        `https://app.pmksplus.com/?${TEMPLATE_LINKAGES['Aircraft_Landing_Gear']}`,
        here
      );
      expect(read.kind).toBe('opened');
      if (read.kind === 'opened') expect(read.summary.runs).toBe(true);
      // And handed back afterwards.
      expect(SettingsService.preservedCylinderScale).toBe(0);
    } finally {
      SettingsService.preservedCylinderScale = held;
    }
  });

  it('reads a floating slot at the link’s own size, and gives the drawing’s back', () => {
    const held = SettingsService.objectScale;
    // A drawing at size 7, ten times the default.
    SettingsService._objectScale.next(7 * MODEL_SCALE);
    try {
      const read = readPastedLink(
        `https://app.pmksplus.com/?${TEMPLATE_LINKAGES['Cylinder_Gripper']}`,
        here
      );
      expect(read.kind).toBe('opened');
      if (read.kind === 'opened') expect(read.summary.runs).toBe(true);
      expect(SettingsService.objectScale).toBe(7 * MODEL_SCALE);
    } finally {
      SettingsService._objectScale.next(held);
    }
  });

  it('opens a whole link without touching anything, and says what it is', () => {
    const read = readPastedLink(`  ${fourBar}  `, here);
    expect(read.kind).toBe('opened');
    if (read.kind !== 'opened') return;
    expect(read.address).toBe(fourBar);
    expect(read.summary.runs).toBe(true);
    expect(read.summary.verdict).toBe('Runs');
    expect(read.summary.meta).toMatch(/\d+ links · \d+ joints/);
    expect(read.summary.line).toContain('runs');
    expect(read.still.startsWith('data:image/svg+xml')).toBe(true);
    // The library's own Four-Bar, recognized as such.
    expect(read.summary.inLibrary?.name).toBe('Four-Bar');
    expect(read.summary.inLibrary?.section).toBe('Start Here');
  });
});
