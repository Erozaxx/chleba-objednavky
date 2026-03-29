# UI Agent – Automatické změny vzhledu webu

## Pro uživatele

### Co to je?
Na stránce **Vzhled webu** (v admin sekci) můžete jednoduše popsat, co chcete na webu změnit – barvy, velikosti písma, rozvržení prvků. Umělá inteligence změnu provede a web se automaticky aktualizuje.

### Co můžete měnit?
- Barvy (tlačítka, pozadí, texty)
- Velikosti písma a nadpisů
- Rozestupy a rozvržení prvků
- Vizuální styl komponent (zaoblení, stíny, okraje)

### Co NEJDE měnit?
- Produkty, ceny, objednávky → to se mění v administraci
- Logiku aplikace (jak fungují objednávky, emaily apod.)
- Přihlašování a zabezpečení

### Jak to použít
1. Otevřete admin stránku a klikněte na **Vzhled webu**
2. Do textového pole napište, co chcete změnit (např. „Zvětšit nadpis na hlavní stránce")
3. Klikněte **Odeslat změnu**
4. Počkejte 1–2 minuty – uvidíte stav zpracování
5. Po dokončení klikněte **Podívat se** a zkontrolujte výsledek

### Příklady požadavků
- „Zvětšit nadpis na hlavní stránce"
- „Změnit barvu tlačítek na tmavší hnědou"
- „Přidat více prostoru mezi sekce na stránce"
- „Zmenšit logo a posunout ho doleva"

### Jak vrátit změnu
Pokud se výsledek nelíbí:
1. V sekci **Poslední změny** najděte poslední změnu
2. Klikněte **Vrátit změnu**
3. Potvrďte v dialogu – web se vrátí do stavu před změnou, žádná data se neztratí

### Co dělat když něco nefunguje?
- **Změna se nepodařila** → Zkuste požadavek přeformulovat jinými slovy
- **Tlačítko je šedé** → Počkejte 5 minut mezi jednotlivými změnami
- **Výsledek nevypadá správně** → Použijte „Vrátit změnu" a zkuste to znovu přesněji
- **Nic nepomáhá** → Kontaktujte správce

---

## Pro vývojáře (Setup)

### Architektura
```
Admin formulář (/admin/[token]/request)
  → POST /api/admin/request (ověří admin token, rate limit)
  → GitHub API workflow_dispatch
  → .github/workflows/ui-agent.yml (GitHub Actions)
  → .github/scripts/ui-agent.js (volá Claude API)
  → git commit + push
  → Vercel auto-deploy
```

### 1. GitHub Secrets
V repozitáři `Erozaxx/chleba-objednavky` → Settings → Secrets and variables → Actions:

| Secret | Hodnota | Popis |
|---|---|---|
| `GH_PAT` | Fine-grained Personal Access Token | Scope: `contents: write` + `actions: write` na repo |
| `ANTHROPIC_API_KEY` | API klíč z console.anthropic.com | Pro Claude API volání |

**Jak vytvořit GH_PAT:**
1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Token name: `ui-agent`
3. Repository access: Only select repositories → `Erozaxx/chleba-objednavky`
4. Permissions:
   - Contents: Read and write
   - Actions: Read and write
5. Generate token → zkopírujte a uložte do GitHub Secrets jako `GH_PAT`

### 2. Vercel Environment Variables
V Vercel dashboardu → projekt → Settings → Environment Variables:

| Proměnná | Hodnota | Prostředí |
|---|---|---|
| `GH_PAT` | Stejný token jako v GitHub Secrets | Production |

(Ostatní env vars – `DATABASE_URL`, `ADMIN_TOKEN`, `CRON_SECRET`, `RESEND_API_KEY` – už by měly být nastavené.)

### 3. Jak otestovat

**A) Ruční test přes GitHub UI:**
1. Repozitář → Actions → UI Agent (v levém menu)
2. „Run workflow" → zadejte prompt (např. „Zvětšit nadpis") + action: `change`
3. Sledujte průběh workflow

**B) Test přes admin formulář:**
1. Otevřete `/admin/<ADMIN_TOKEN>/request`
2. Zadejte požadavek a odešlete
3. Sledujte stavy na stránce

### 4. Troubleshooting

| Problém | Pravděpodobná příčina | Řešení |
|---|---|---|
| Build selže v Actions | Syntaktická chyba v AI změně | Zkontrolujte Actions log, rollback commitu |
| Vercel se nedeployuje po push | Špatný token (built-in GITHUB_TOKEN místo GH_PAT) | Push přes GH_PAT spouští webhooky, built-in token ne |
| 401 na GitHub API | GH_PAT expiroval nebo nemá správný scope | Vygenerujte nový token s `contents: write` + `actions: write` |
| Claude vrátí nesmysl | Prompt je příliš vágní nebo mimo scope | Přeformulujte přesněji, zaměřte se na vizuální aspekty |
| Rate limit (šedé tlačítko) | Max 1 požadavek za 5 minut | Počkejte na odpočet |
| Rollback selže | Mezitím proběhly další commity | Ruční `git revert <sha>` v CLI |

### 5. Bezpečnostní model

- **Allowlist souborů** – AI smí měnit pouze: `components/**`, `app/**/page.tsx`, `app/**/layout.tsx`, `app/globals.css`, `tailwind.config.ts`
- **Denylist** – zakázáno: `middleware.ts`, `lib/db/**`, `.env*`, `package.json`, `app/api/**`, `next.config.*`
- **Build validace** – před commitem se spustí `npm run build`, pokud selže → commit se neprovede
- **Concurrency** – max 1 workflow run najednou
- **Rate limit** – max 1 požadavek za 5 minut
