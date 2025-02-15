import { Component } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule],
  providers: [
    // Provide a default ActivatedRoute since this component is outside a router outlet
    { provide: ActivatedRoute, useValue: new ActivatedRoute() }
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {}
