COMPOSE := docker compose

.PHONY: up down logs seed ps traffic traffic-stop smoke

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=100

seed:
	$(COMPOSE) exec -T postgres psql -U bitsburg -d bitsburg -f /seed/seed.sql

traffic:
	$(COMPOSE) --profile traffic up -d --build traffic-gen

traffic-stop:
	$(COMPOSE) --profile traffic stop traffic-gen

smoke:
	./scripts/smoke.sh
