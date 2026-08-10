# Dokumentacja Inspect Hub

Ten katalog jest głównym źródłem dokumentacji technicznej i operacyjnej
Inspect Hub. Dokumentacja opisuje stan odpowiadający kodowi w tym repozytorium.

## Spis treści

1. [Architektura](architecture.md) — komponenty, zależności i przepływy.
2. [Model domenowy](domain-model.md) — encje, reguły biznesowe i wersjonowanie.
3. [API](api.md) — endpointy, autoryzacja, parametry i przykłady.
4. [Konfiguracja](configuration.md) — zmienne środowiskowe i ustawienia SCADA.
5. [Rozwój i testowanie](development.md) — uruchomienie, komendy i standardy.
6. [Bezpieczeństwo](security.md) — granice zaufania, sekrety i hardening.
7. [Wdrożenie](deployment.md) — procedura release, migracje i rollback.
8. [Operacje](operations.md) — monitoring, backup, incydenty i troubleshooting.
9. [Integracje](integrations.md) — SCADA, APACS i MinIO.

## Szybki start lokalny

```sh
cp .env.example .env
pnpm install
docker compose up -d
pnpm --filter @inspect-hub/database db:generate
pnpm --filter @inspect-hub/database db:push
pnpm dev
```

Frontend działa domyślnie pod `http://localhost:5173`, a API pod
`http://localhost:3000/api`.

## Status dokumentacji

Przy zmianie kontraktu API, schematu Prisma, zmiennych środowiskowych lub
procesu wdrożenia należy zaktualizować odpowiedni dokument w tym katalogu w tym
samym pull requeście.
