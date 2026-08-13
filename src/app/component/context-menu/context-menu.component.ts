import { Component, Inject, Input, ChangeDetectionStrategy } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MechanismService } from '../../services/mechanism.service';
import { NewGridComponent } from '../new-grid/new-grid.component';

export class cMenuItem {
  public label: string = 'none';
  public action: Function = () => {
    console.error('Not implemented');
  };
  public icon: string = 'none';
  public disabled: boolean = false;

  constructor(_label: string, _action: Function, _icon: string, _disabled: boolean = false) {
    this.label = _label;
    this.action = _action;
    this.icon = _icon;
    this.disabled = _disabled;
  }

  actionWrapper() {
    // Silently, like every other guard on editing away from the start pose: the
    // transport says where the mechanism is parked, and it said the wrong thing
    // anyway -- the test here is the timestep, and the message it showed was
    // the one about the animation running, which it need not be.
    if (NewGridComponent.instance.mechanismSrv.mechanismTimeStep !== 0) {
      return;
    }
    this.action();
  }
}

@Component({
  selector: 'app-context-menu',
  animations: [
    trigger('openClose', [
      state(
        'open',
        style({
          opacity: 1,
          transform: 'scale(1)',
        })
      ),
      state(
        'closed',
        style({
          opacity: 0,
          transform: 'scale(0.5)',
        })
      ),
      transition('closed => open', [animate('0.2s ease-out')]),
      transition('open => closed', [animate('0.2s ease-in')]),
    ]),
  ],
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ContextMenuComponent {
  @Input() menuItems: cMenuItem[] = [];
  private contextMenu!: HTMLElement;

  constructor(private mechanismSrv: MechanismService) {}

  ngAfterViewInit() {
    this.contextMenu = document.querySelector('#contextMenu') as HTMLElement;
    console.log(this.contextMenu);
    setTimeout(() => {
      this.contextMenu.classList.add('show');
    }, 1);
  }
}
