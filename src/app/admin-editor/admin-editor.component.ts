import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BlogService, BlogPost } from '../blog.service';
import { ImagekitService } from '../imagekit.service';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-admin-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-editor.component.html',
  styleUrls: ['./admin-editor.component.scss']
})
export class AdminEditorComponent implements OnInit {
  posts: BlogPost[] = [];
  editing: BlogPost | null = null;
  loading = false;
  tagsText = '';
  images: string[] = []; // Changed from imagesText to images array

  constructor(private svc: BlogService, private imagekitSvc: ImagekitService, @Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    // Only load posts in the browser, not during SSR
    if (isPlatformBrowser(this.platformId)) {
      this.reload();
    }
  }

  reload() { this.svc.list().subscribe(r => this.posts = r); }

  newPost() { 
  this.editing = { title: '', description: '', tags: [], images: [], category: undefined, created_at: Math.floor(Date.now()/1000) };
    this.images = [];
  }

  edit(p: BlogPost) { 
  this.editing = { ...p }; 
    this.tagsText = (p.tags || []).join(', '); 
    this.images = p.images || []; 
  }

  save() {
    if (!this.editing) return;
    // normalize tags from text field
    this.editing.tags = this.tagsText ? this.tagsText.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    this.editing.images = this.images;
    const op = this.editing.id ? this.svc.update(this.editing) : this.svc.create(this.editing);
    op.subscribe(() => { 
      this.editing = null; 
      this.tagsText = ''; 
      this.images = []; 
      this.reload(); 
    });
  }

  remove(id?: number) { if (!id) return; this.svc.delete(id).subscribe(() => this.reload()); }

  initDb() { this.svc.init().subscribe(() => this.reload()); }

  // Image upload methods
  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        this.uploadImage(files[i]);
      }
    }
  }

  private async uploadImage(file: File) {
    try {
      this.loading = true;
      const result = await this.imagekitSvc.uploadImage(file);
      this.images.push(result.url);
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Image upload failed. Please try again.');
    } finally {
      this.loading = false;
    }
  }

  removeImage(index: number) {
    this.images.splice(index, 1);
  }

  addImageSlot() {
    // This will trigger the file input
    const fileInput = document.getElementById('imageInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // Helpers for created_at binding
  get createdAtLocal(): string {
    if (!this.editing?.created_at) return '';
    try {
      return new Date(this.editing.created_at * 1000).toISOString().slice(0,16);
    } catch { return ''; }
  }

  onCreatedAtChange(v: string) {
    if (!this.editing) return;
    if (!v) { this.editing.created_at = undefined; return; }
    const ms = Date.parse(v);
    if (!isNaN(ms)) this.editing.created_at = Math.floor(ms / 1000);
  }
}
