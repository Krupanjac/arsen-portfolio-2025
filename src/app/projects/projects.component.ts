import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- Add this line
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';
import { BlogService, BlogPost } from '../blog.service';
import { BlogModalComponent } from '../blog-modal/blog-modal.component';
import { ImagekitService } from '../imagekit.service';
import { isPlatformBrowser } from '@angular/common';

interface Project {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-projects',
  standalone: true, // Standalone component
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective, BlogModalComponent], // <-- Add CommonModule here
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.scss']
})
export class ProjectsComponent implements OnInit {
  // Static placeholders removed — populate this array from a service or content source instead.
  projects: Project[] = [];
  blogPosts: BlogPost[] = [];
  selectedPost: BlogPost | null = null;
  modalVisible: boolean = false;

  constructor(private blogService: BlogService, @Inject(PLATFORM_ID) private platformId: Object, private imagekitService: ImagekitService) {}

  ngOnInit() {
    // Only load blog posts in the browser, not during SSR
    if (isPlatformBrowser(this.platformId)) {
      this.loadBlogPosts();
    }
  }

  loadBlogPosts() {
    this.blogService.list().subscribe(posts => {
      this.blogPosts = posts.filter(post => post.category === 'project');
    });
  }

  // Get responsive image URLs for preview
  getPreviewImageUrl(imageUrl: string): string {
    if (!imageUrl) return '';
    // If it's already an ImageKit URL, use the service to generate responsive version
    if (imageUrl.includes('ik.imagekit.io')) {
      return this.imagekitService.getPreviewImageUrls(imageUrl);
    }
    // Otherwise return as is
    return imageUrl;
  }

  openModal(post: BlogPost): void {
    this.selectedPost = post;
    this.modalVisible = true;
  }

  closeModal(): void {
    this.modalVisible = false;
    this.selectedPost = null;
  }
}
