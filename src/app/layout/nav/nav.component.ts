import { Component } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterModule],
  providers: [
    // Provide a default ActivatedRoute since this component is outside a router outlet
    { provide: ActivatedRoute, useValue: new ActivatedRoute() }
  ],
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss']
})
export class NavComponent {}
