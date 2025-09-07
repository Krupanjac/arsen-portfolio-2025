import { Pipe, PipeTransform, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked once
marked.setOptions({
  gfm: true,
  breaks: true, // convert single newlines to <br>
});

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  constructor(
    private sanitizer: DomSanitizer,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  transform(value?: string | null): SafeHtml {
    if (!value) return '';

    let html = '';
    try {
      // marked.parse may be typed as Promise<string> | string; force sync usage
      html = marked.parse(value) as unknown as string;
    } catch {
      // Fallback: escape and preserve newlines if marked fails
      const escaped = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html = escaped.replace(/\n/g, '<br/>');
    }

    // Sanitize
    let clean = html;
    try {
      if (isPlatformBrowser(this.platformId)) {
        // Use DOMPurify with default safe list
        clean = DOMPurify.sanitize(html);
      } else if (isPlatformServer(this.platformId)) {
        // Basic server-side sanitation to avoid XSS during SSR
        clean = html
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/on\w+\s*=\s*'[^']*'/gi, '')
          .replace(/javascript:/gi, '');
      }
    } catch {
      // If sanitization fails for any reason, fall back to escaped newlines
      const escaped = (value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      clean = escaped.replace(/\n/g, '<br/>');
    }

    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}

@Pipe({
  name: 'markdownInline',
  standalone: true,
})
export class MarkdownInlinePipe implements PipeTransform {
  constructor(
    private sanitizer: DomSanitizer,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  transform(value?: string | null): SafeHtml {
    if (!value) return '';
    let html = '';
    try {
      html = marked.parseInline(value) as unknown as string;
    } catch {
      const escaped = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html = escaped.replace(/\n/g, '<br/>');
    }

    let clean = html;
    try {
      if (isPlatformBrowser(this.platformId)) {
        clean = DOMPurify.sanitize(html);
      } else if (isPlatformServer(this.platformId)) {
        clean = html
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/on\w+\s*=\s*'[^']*'/gi, '')
          .replace(/javascript:/gi, '');
      }
    } catch {
      const escaped = (value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      clean = escaped.replace(/\n/g, '<br/>');
    }

    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
