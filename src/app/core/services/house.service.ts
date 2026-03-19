import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { HouseInfo, HouseSchema } from '@toon-live/game-types';

export interface HouseCreateRequest {
  name: string;
  schemaId: number;
  access: 'OPEN' | 'PASSWORD' | 'CLOSED';
  password?: string;
}

export interface HouseUpdateRequest {
  name: string;
  schemaId?: number;
  access: 'OPEN' | 'PASSWORD' | 'CLOSED';
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class HouseService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  listSchemas() {
    return this.http.get<HouseSchema[]>(`${this.base}/house-schemas`);
  }

  listHouses() {
    return this.http.get<HouseInfo[]>(`${this.base}/houses`);
  }

  listMyHouses() {
    return this.http.get<HouseInfo[]>(`${this.base}/houses/mine`);
  }

  createHouse(req: HouseCreateRequest) {
    return this.http.post<HouseInfo>(`${this.base}/houses`, req);
  }

  updateHouse(id: number, req: HouseUpdateRequest) {
    return this.http.put<HouseInfo>(`${this.base}/houses/${id}`, req);
  }

  deleteHouse(id: number) {
    return this.http.delete<void>(`${this.base}/houses/${id}`);
  }

  /** Valide l'accès à une maison. La requête retourne 200 ou lance une erreur HTTP. */
  enterHouse(id: number, password?: string) {
    return this.http.post<void>(`${this.base}/houses/${id}/enter`, password ? { password } : {});
  }
}
