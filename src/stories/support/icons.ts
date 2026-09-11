import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * The app's own SVG icons, by the names the templates ask for.
 *
 * `AppComponent` registers these in its constructor, and a story never
 * constructs `AppComponent` -- so without this every `svgIcon` in a block
 * renders as an empty square. Names map to files the same way they do there:
 * mostly one to one, with `remove` drawn from `trash.svg` and `edit_outline`
 * from `edit.svg`.
 */
const APP_ICONS: Record<string, string> = {
  com: 'com',
  com_off: 'com_off',
  abc: 'abc',
  abc_off: 'abc_off',
  new_link: 'new_link',
  add_ground: 'add_ground',
  remove_ground: 'remove_ground',
  add_slider: 'add_slider',
  add_cylinder: 'add_cylinder',
  remove_slider: 'remove_slider',
  add_input: 'add_input',
  remove_input: 'remove_input',
  remove: 'trash',
  add_force: 'add_force',
  add_tracer: 'add_tracer',
  show_path: 'show_path',
  hide_path: 'hide_path',
  switch_force_dir: 'switch_force_dir',
  force_global: 'force_global',
  force_local: 'force_local',
  weld_joint: 'weld_joint',
  unweld_joint: 'unweld_joint',
  make_circular: 'make_circular',
  make_bar: 'make_bar',
  github: 'github',
  edit_outline: 'edit',
  background_image: 'background_image',
  synthesis: 'synthesis',
  lock: 'lock',
  unlock: 'unlock',
  fit_linkage: 'fit_linkage',
  fit_motion: 'fit_motion',
  vector_velocity: 'vector_velocity',
  vector_acceleration: 'vector_acceleration',
  vector_force: 'vector_force',
  delete_mechanism: 'delete_mechanism',
};

/** Registers every app icon before the first story renders. */
export function provideAppIcons(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    for (const [name, file] of Object.entries(APP_ICONS)) {
      registry.addSvgIcon(
        name,
        sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${file}.svg`)
      );
    }
  });
}
