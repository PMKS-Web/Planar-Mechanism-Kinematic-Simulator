import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

/** Both document editors use the same registered artwork and shared blocks. */
export function registerAppIcons(registry: MatIconRegistry, sanitizer: DomSanitizer): void {
  registry.addSvgIcon('com', sanitizer.bypassSecurityTrustResourceUrl('assets/icons/com.svg'));
  registry.addSvgIcon(
    'com_off',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/com_off.svg')
  );
  registry.addSvgIcon('abc', sanitizer.bypassSecurityTrustResourceUrl('assets/icons/abc.svg'));
  registry.addSvgIcon(
    'abc_off',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/abc_off.svg')
  );
  registry.addSvgIcon(
    'new_link',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/new_link.svg')
  );
  registry.addSvgIcon(
    'add_ground',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_ground.svg')
  );
  registry.addSvgIcon(
    'remove_ground',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_ground.svg')
  );
  registry.addSvgIcon(
    'add_slider',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_slider.svg')
  );
  registry.addSvgIcon(
    'add_cylinder',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_cylinder.svg')
  );
  registry.addSvgIcon(
    'remove_slider',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_slider.svg')
  );
  registry.addSvgIcon(
    'add_input',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_input.svg')
  );
  registry.addSvgIcon(
    'remove_input',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_input.svg')
  );
  registry.addSvgIcon('remove', sanitizer.bypassSecurityTrustResourceUrl('assets/icons/trash.svg'));
  registry.addSvgIcon(
    'add_force',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_force.svg')
  );
  registry.addSvgIcon(
    'add_tracer',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_tracer.svg')
  );
  registry.addSvgIcon(
    'show_path',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/show_path.svg')
  );
  registry.addSvgIcon(
    'hide_path',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/hide_path.svg')
  );
  registry.addSvgIcon(
    'switch_force_dir',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/switch_force_dir.svg')
  );
  registry.addSvgIcon(
    'force_global',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/force_global.svg')
  );
  registry.addSvgIcon(
    'force_local',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/force_local.svg')
  );
  registry.addSvgIcon(
    'weld_joint',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/weld_joint.svg')
  );
  registry.addSvgIcon(
    'unweld_joint',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/unweld_joint.svg')
  );
  registry.addSvgIcon(
    'make_circular',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/make_circular.svg')
  );
  registry.addSvgIcon(
    'make_bar',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/make_bar.svg')
  );
  registry.addSvgIcon(
    'github',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/github.svg')
  );
  registry.addSvgIcon(
    'edit_outline',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/edit.svg')
  );
  registry.addSvgIcon(
    'background_image',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/background_image.svg')
  );
  registry.addSvgIcon(
    'synthesis',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/synthesis.svg')
  );
  registry.addSvgIcon('lock', sanitizer.bypassSecurityTrustResourceUrl('assets/icons/lock.svg'));
  registry.addSvgIcon(
    'unlock',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/unlock.svg')
  );
  // The two fit buttons. Material's `crop_free` and `all_out` are a pair of
  // brackets and a pair of arrows, which said "frame something" and "spread
  // out" and left which one framed the drawing and which framed its whole
  // travel to be worked out from the tooltip. These say it: the same
  // brackets on both, closed on a single point for the pose as it sits, and
  // opened around the dashed ring that point sweeps through for the cycle.
  registry.addSvgIcon(
    'fit_linkage',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/fit_linkage.svg')
  );
  registry.addSvgIcon(
    'fit_motion',
    sanitizer.bypassSecurityTrustResourceUrl('assets/icons/fit_motion.svg')
  );
  // The right-click menu's last four glyphs, which were Material ligatures
  // (call_made, double_arrow, compare_arrows, delete_sweep) in a menu drawn
  // otherwise entirely in the app's own family. Velocity and acceleration
  // are a quantity leaving a joint -- one open head, then two on the same
  // shaft -- and force is a load arriving at one, so its arrow is turned
  // round. Delete entire mechanism is a ternary body with the trash where
  // `new_link` and the `add_*` glyphs put their plus.
  const menuGlyphs = ['vector_velocity', 'vector_acceleration', 'vector_force', 'delete_mechanism'];
  for (const name of menuGlyphs) {
    registry.addSvgIcon(name, sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${name}.svg`));
  }
}
