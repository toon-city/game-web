import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Vérification proactive : si le token est expiré, déconnecter avant même l'envoi.
  if (!auth.isLoggedIn() && auth.token()) {
    auth.logout();
    return throwError(() => new Error('Token expiré'));
  }

  const token = auth.token();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // Ne déconnecter que si le token est réellement invalide/expiré côté client.
        // Si isLoggedIn() est true mais le serveur renvoie 401, c'est un bug serveur
        // (ex : double-registration de filtre Spring Security) — ne pas déconnecter.
        // Le token expiré est déjà capturé par le check proactif ci-dessus ;
        // ce cas couvre le scénario où la vérification cliente a raté (horloge décalée, etc.).
        if (!auth.isLoggedIn()) {
          auth.logout();
        }
      }
      return throwError(() => err);
    }),
  );
};
