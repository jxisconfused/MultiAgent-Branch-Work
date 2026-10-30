import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Link, LinksService } from './links.service';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './snip.component.html',
  styleUrl: './snip.component.css'
})
export class AppComponent {
  private readonly linksService = inject(LinksService);

  readonly apiAddress = this.linksService.apiOrigin || 'same origin';
  readonly url = signal('');
  readonly links = signal<Link[]>([]);
  readonly shortenedLink = signal<Link | null>(null);
  readonly errorMessage = signal('');
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly isUrlValid = computed(() => {
    const value = this.url().trim();
    if (!value) return false;

    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });

  ngOnInit(): void {
    this.linksService.getAll().subscribe({
      next: (links) => {
        this.links.set(links);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.describeError(error));
        this.isLoading.set(false);
      },
    });
  }

  onUrlChange(value: string): void {
    this.url.set(value);
    this.errorMessage.set('');
    this.shortenedLink.set(null);
  }

  createLink(): void {
    const value = this.url().trim();
    if (!this.isUrlValid()) {
      this.errorMessage.set('Enter a valid HTTP or HTTPS URL.');
      return;
    }
    if (this.isSubmitting()) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.linksService.create(value).subscribe({
      next: (link) => {
        this.shortenedLink.set(link);
        this.links.update((links) => [link, ...links]);
        this.url.set('');
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.describeError(error));
        this.isSubmitting.set(false);
      },
    });
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error;
      if (typeof message === 'string') return message;
      if (error.status === 0) return 'Cannot reach the Snip API.';
      return `The request failed (${error.status}). Please try again.`;
    }

    return 'Something went wrong. Please try again.';
  }
}
