import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBuilding2 } from '@ng-icons/lucide';

@Component({
  imports: [RouterLink, RouterOutlet, NgIcon],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideBuilding2 })],
})
export class App {}
