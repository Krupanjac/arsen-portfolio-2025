import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';
import { BlogService, BlogPost } from '../blog.service';
import { BlogModalComponent } from '../blog-modal/blog-modal.component';
import { isPlatformBrowser } from '@angular/common';

interface WorkItem {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-work',
  standalone: true,
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective, BlogModalComponent],
  templateUrl: './work.component.html',
  styleUrls: ['./work.component.scss']
})
export class WorkComponent implements OnInit {
  // Static placeholders removed — populate this array from a service or content source instead.
  workItems: WorkItem[] = [];
  blogPosts: BlogPost[] = [];
  selectedPost: BlogPost | null = null;
  modalVisible: boolean = false;

  constructor(private blogService: BlogService, @Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    // Only load blog posts in the browser, not during SSR
    if (isPlatformBrowser(this.platformId)) {
      this.loadBlogPosts();
    }
  }

  loadBlogPosts() {
    this.blogService.list().subscribe(posts => {
      this.blogPosts = posts.filter(post => post.category === 'work');
    });
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
