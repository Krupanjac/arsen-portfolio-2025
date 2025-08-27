import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BlogPost {
  id?: number;
  title: string;
  description?: string;
  tags?: string[];
  images?: string[];
  created_by?: string;
  created_at?: number;
}

@Injectable({ providedIn: 'root' })
export class BlogService {
  private base = '/api/posts';
  constructor(private http: HttpClient) {}

  list(): Observable<BlogPost[]> { return this.http.get<BlogPost[]>(this.base); }
  get(id: number): Observable<BlogPost> { return this.http.get<BlogPost>(`${this.base}?id=${id}`); }
  create(post: BlogPost) { return this.http.post(this.base, post); }
  update(post: BlogPost) { return this.http.put(this.base, post); }
  delete(id: number) { return this.http.delete(`${this.base}?id=${id}`); }
  init() { return this.http.post(`${this.base}/init`, {}); }
}
