import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';
import { BlogService, BlogPost } from '../blog.service';

@Component({
  selector: 'app-work',
  standalone: true,
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective],
  templateUrl: './work.component.html',
  styleUrls: ['./work.component.scss']
})
export class WorkComponent implements OnInit {
  // Work experiences extracted from blog posts with category 'work'
  workPosts: BlogPost[] = [];

  constructor(private blogService: BlogService, @Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    // Only load blog posts in the browser, not during SSR
    if (isPlatformBrowser(this.platformId)) {
      this.loadBlogPosts();
    }
  }

  loadBlogPosts() {
    this.blogService.list().subscribe(posts => {
      // Only keep category 'work'
      this.workPosts = posts.filter(post => post.category === 'work');
      // Sort descending by date (most recent first) if dates exist
      this.workPosts.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    });
  }
}
