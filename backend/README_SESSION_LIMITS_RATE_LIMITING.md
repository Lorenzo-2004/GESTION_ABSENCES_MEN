# Durée des sessions et limitation des requêtes

## Politique appliquée

- Jeton d'accès : 15 minutes.
- Session authentifiée : 8 heures maximum à partir de la connexion, même si les jetons sont renouvelés.
- Refresh token rotatif et révoqué après rotation, dans la limite absolue de la session.
- Connexion : 5 tentatives par minute et 20 par heure, par adresse IP.
- Renouvellement de session : 30 requêtes par minute et par adresse IP.
- API anonyme : 60 requêtes par minute ; API par utilisateur : 300 requêtes par minute.
- OCR des décisions : 10 analyses par heure et par compte RH.

Les limites sont configurables dans `config/settings/base.py` et les durées de session avec `MEN_SESSION_MAX_HOURS` et `MEN_ACCESS_TOKEN_MINUTES` dans `.env`. Après 8 heures, l'utilisateur doit se reconnecter. Le renouvellement fait expirer les cookies quand la session est absente, invalide ou expirée.

## Vérifications locales

```powershell
python manage.py check
python manage.py test personnels.tests_session_rate_limits --keepdb
python manage.py test personnels.tests_auth_cookie_security personnels.tests_auth_cookie_lifecycle personnels.tests_auth_bearer --keepdb
```

`manage.py test` bascule automatiquement sur `config.settings.test` quand aucun `--settings` explicite n'est fourni. Les limites sont désactivées dans cet environnement de test pour empêcher des tests de se bloquer mutuellement ; le test dédié active une limite très basse uniquement pendant son scénario.

## Cache et déploiement multiprocessus

DRF stocke les compteurs dans le cache Django. Avec le cache mémoire local par défaut, les compteurs sont propres au processus : c'est adapté à `runserver` mais pas suffisant pour répartir une limite entre plusieurs workers Gunicorn. Le cache est configurable via `DJANGO_CACHE_BACKEND` et `DJANGO_CACHE_LOCATION`. Pour utiliser le cache de base de données Django partagé par tous les workers, décommentez les deux variables correspondantes dans `.env`, puis exécutez `python manage.py createcachetable men_rate_limit_cache`. Cette commande crée la table de cache (elle ne remplace pas les migrations de l'application). On peut également choisir un backend Redis si le paquet nécessaire est installé.
