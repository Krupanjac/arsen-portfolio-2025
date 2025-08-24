import { Routes } from '@angular/router';
import { ProjectsComponent } from './projects/projects.component';
import { WorkComponent } from './work/work.component';
import { AboutComponent } from './about/about.component';
import { ContactComponent } from './contact/contact.component';
import { HomeComponent } from './home/home.component';
import { AdminComponent } from './admin/admin.component';
import { authGuard } from './auth.guard';

export const appRoutes: Routes = [
  { path: '', component: HomeComponent, data: { animation: 'HomePage' } },
  { path: 'projects', component: ProjectsComponent, data: { animation: 'ProjectsPage' } },
  { path: 'work', component: WorkComponent, data: { animation: 'WorkPage' } },
  { path: 'about', component: AboutComponent, data: { animation: 'AboutPage' } },
  { path: 'contact', component: ContactComponent, data: { animation: 'ContactPage' } },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard], data: { animation: 'AdminPage' } },
  { path: '**', redirectTo: '' }
];
