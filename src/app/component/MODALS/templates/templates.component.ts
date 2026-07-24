import { Component, ChangeDetectionStrategy } from '@angular/core';
import { BuiltInTemplateID, TEMPLATE_LINKAGES } from './template-linkages';

@Component({
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class TemplatesComponent {
  openLinkage(linkage: BuiltInTemplateID) {
    const content = TEMPLATE_LINKAGES[linkage];
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    const dataURLString = `${url}?${content}`;

    console.log(dataURLString);

    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }
}
