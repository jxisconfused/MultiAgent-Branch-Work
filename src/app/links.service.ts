import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Link {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinksService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'http://localhost:3000/api/links';

  getAll(): Observable<Link[]> {
    return this.http.get<Link[]>(this.endpoint);
  }

  create(url: string): Observable<Link> {
    return this.http.post<Link>(this.endpoint, { url });
  }
}