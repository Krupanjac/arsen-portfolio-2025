import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlogService, BlogPost } from '../blog.service';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.scss']
})
export class BlogListComponent implements OnInit {
  posts: BlogPost[] = [];
  loading = true;
  constructor(private svc: BlogService) {}
  ngOnInit(): void { this.svc.list().subscribe(p => { this.posts = p; this.loading = false; }); }
}
