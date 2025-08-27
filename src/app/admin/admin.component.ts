import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminEditorComponent } from '../admin-editor/admin-editor.component';
import { BlogListComponent } from '../blog-list/blog-list.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, AdminEditorComponent, BlogListComponent],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent {}
