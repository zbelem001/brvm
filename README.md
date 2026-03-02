# brvm

This repository contains a backend FastAPI application and an Angular frontend. The database is expected to be PostgreSQL and can be hosted in the cloud.

## Containerization 🐳

The backend requires Python 3.12 or later (pandas‑ta currently only publishes wheels for ≥3.12), so the Dockerfile uses `python:3.12-slim`. You can build and run each part of the stack using Docker. A `docker-compose.yml` is provided at the root.

### Building images

```sh
# from workspace root
docker-compose build
```

### Configuration

Copy `.env.sample` to `.env` and edit the database connection values. If you are using a cloud PostgreSQL instance, set `DB_HOST` to the host name and provide credentials. Alternatively you can set `DATABASE_URL` directly.

### Running locally

```sh
docker-compose up
```

The backend will be available on `http://localhost:8000` and the frontend on `http://localhost:3000`.

### Production deployments

- Push `backend` and `frontend` images to your container registry (e.g. Docker Hub, ECR, GCR).
- Configure the cloud database separately; the containers only need the connection string.
- Use your orchestration tool of choice (Kubernetes, ECS, etc.) to start the services with environment variables pointing at the managed database.
- If you don't want to build the frontend image yourself, you can host the built static assets on any CDN or object‑storage.

### Migrer vers Neon.tech

[Neon](https://neon.tech) fournit des instances PostgreSQL serverless. la configuration existante du backend utilise déjà une URL de connexion (via `DATABASE_URL` ou les variables de base). pour basculer :

1. installez l'outil CLI :
   ```sh
   npm install -g neonctl
   ```
2. créez un projet et une branche :
   ```sh
   neonctl project create brvm-project
   neonctl branch create main
   neonctl connect main  # affiche la connexion postgres
   ```
3. copiez l’URL fournie (quelque chose comme `postgresql://user:pass@branch.project.region.neon.tech/dbname`) et placez-la dans votre `.env` :
   ```ini
   DATABASE_URL=postgresql://…
   ```
4. migrez les données définies localement :
   ```sh
   # fournissez explicitement l'URL cible Neon comme argument ;
   # le fichier .env est lu pour trouver les paramètres de la base *locale*.
   scripts/migrate_to_neon.sh "postgresql://…neon…"
   ```
   Le script utilise des variables `LOCAL_DB_HOST`, `LOCAL_DB_PORT`, `LOCAL_DB_USER`,
   `LOCAL_DB_NAME` (chargées depuis `.env` ou par défaut localhost/5432/postgres/brvm) pour
   faire le `pg_dump`. Le premier paramètre fournit l'URL de destination.

le backend utilisera automatiquement la base Neon via l’URL, que ce soit en local (via `docker-compose` + `.env`) ou en production.

---


