# game-web

Frontend Angular 17 du projet Toon City.

## Stack

- **Angular 17** — standalone components, signals
- **PixiJS 8** — rendu isométrique 2D (via `game-core`)
- **Angular CDK** — drag & drop (navigateur, panel joueurs)
- **Angular Material** — dialogs, snackbars
- **Bun** — package manager / dev server (via `ng serve`)

## Architecture

```
src/app/
├── core/
│   ├── services/        # auth, stats, deditoon, user-list, socket, house…
│   └── interceptors/    # authInterceptor (JWT Bearer)
├── features/
│   ├── lobby/           # Écran d'accueil + login
│   └── game/            # Canvas Pixi + chat
└── shared/
    └── components/
        ├── status-bar/  # Barre supérieure (connectés + déditoons)
        ├── navigator/   # Navigateur de salles (drag & drop)
        ├── inventory/   # Inventaire personnage
        ├── navbar/      # Navigation principale
        └── identity-card/  # Carte profil (kreds, pez)
```

## Lancer en développement

```bash
make dev-web
# ou
cd game-web && bun run start
```

Proxy configuré dans `proxy.conf.json` :
- `/api/**` → `http://localhost:8080`
- `/ws/**` → `http://localhost:8081`

## Build production

```bash
cd game-web && bun run build
```
