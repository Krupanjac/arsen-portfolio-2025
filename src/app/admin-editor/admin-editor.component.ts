import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BlogService, BlogPost } from '../blog.service';

@Component({
  selector: 'app-admin-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-editor.component.html',
  styleUrls: ['./admin-editor.component.scss']
})
export class AdminEditorComponent {
  posts: BlogPost[] = [];
  editing: BlogPost | null = null;
  loading = false;
  tagsText = '';
  imagesText = '';

  constructor(private svc: BlogService) { this.reload(); }

  reload() { this.svc.list().subscribe(r => this.posts = r); }

  newPost() { this.editing = { title: '', description: '', tags: [], images: [] }; }

  edit(p: BlogPost) { this.editing = { ...p }; this.tagsText = (p.tags || []).join(', '); this.imagesText = (p.images || []).join(', '); }

  save() {
    if (!this.editing) return;
    // normalize tags/images from text fields
    this.editing.tags = this.tagsText ? this.tagsText.split(',').map(s => s.trim()).filter(Boolean) : [];
    this.editing.images = this.imagesText ? this.imagesText.split(',').map(s => s.trim()).filter(Boolean) : [];
    const op = this.editing.id ? this.svc.update(this.editing) : this.svc.create(this.editing);
    op.subscribe(() => { this.editing = null; this.tagsText = ''; this.imagesText = ''; this.reload(); });
  }

  remove(id?: number) { if (!id) return; this.svc.delete(id).subscribe(() => this.reload()); }

  initDb() { this.svc.init().subscribe(() => this.reload()); }
}
