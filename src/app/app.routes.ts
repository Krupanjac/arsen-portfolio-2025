import { Routes } from '@angular/router';
import { ProjectsComponent } from './projects/projects.component';
import { WorkComponent } from './experience/experience.component';
import { AboutComponent } from './about/about.component';
import { ContactComponent } from './contact/contact.component';
import { HomeComponent } from './home/home.component';
import { AdminComponent } from './admin/admin.component';
import { BlogListComponent } from './blog-list/blog-list.component';
import { authGuard } from './auth.guard';

export const appRoutes: Routes = [
  { path: '', component: HomeComponent, data: { animation: 'HomePage' } },
  { path: 'projects', component: ProjectsComponent, data: { animation: 'ProjectsPage' } },
  { path: 'experience', component: WorkComponent, data: { animation: 'WorkPage' } },
  { path: 'about', component: AboutComponent, data: { animation: 'AboutPage' } },
  { path: 'blog', component: BlogListComponent, data: { animation: 'BlogPage' } },
  { path: 'contact', component: ContactComponent, data: { animation: 'ContactPage' } },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard], data: { animation: 'AdminPage' } },
  { path: '**', redirectTo: '' }
];
