# Nastaveni GitHub Actions -- navod krok za krokem

---

## 1. Co budeme delat

Nastavime automaticky system, ktery vam umozni menit vzhled webu primo z admin stranky -- staci napsat cesky, co chcete zmenit, a umela inteligence to provede za vas. K tomu potrebujeme vytvorit pristupovy klic na GitHubu, ulozit ho na spravna mista a overit, ze vse funguje.

Cely proces zabere priblizne 15-20 minut. Budeme pracovat ve trech systemech: GitHub, Anthropic (poskytovatel umele inteligence) a Vercel (kde bezi vas web).

---

## 2. Vytvoreni Personal Access Tokenu (pristupovy klic)

Personal Access Token (zkracene PAT) je neco jako specialni heslo, ktere umozni automatickemu systemu zapisovat zmeny do vaseho kodu na GitHubu. Bez nej by system nemel opravneni nic menit.

### Krok 2.1 -- Otevrete stranku pro vytvoreni tokenu

Otevrete v prohlizeci tuto adresu (klidne ji zkopirujte cele):

```
https://github.com/settings/personal-access-tokens/new
```

Pokud nejste prihlaseni na GitHubu, prihlaste se svym uctem **Erozaxx**.

### Krok 2.2 -- Vyplnte zakladni udaje

Na strance uvidite formular. Vyplnte:

- **Token name** (nazev tokenu): napiste `ui-agent`
- **Expiration** (platnost): kliknete na rozbalovaci menu a vyberte **90 days** (nebo **Custom...** a zvolte datum podle sveho uvazeni). Pozor: az token vyprsi, budete ho muset vytvorit znovu -- stejnym postupem.
- **Description** (popis): muzete nechat prazdne, nebo napsat `Token pro UI agenta`

### Krok 2.3 -- Vyberte repozitar

V sekci **Repository access** (pristup k repozitarum):

1. Kliknete na kolecko **Only select repositories** (pouze vybrane repozitare)
2. Objevi se rozbalovaci menu **Select repositories** -- kliknete na nej
3. Zacnete psat `chleba` a v nabidce se objevi `Erozaxx/chleba-objednavky`
4. Kliknete na nej -- repozitar se prida do seznamu

### Krok 2.4 -- Nastavte opravneni

Kousek nize je sekce **Permissions** (opravneni). Kliknete na **Repository permissions** -- rozbali se seznam.

Najdete tyto dve polozky a u kazde kliknete na rozbalovaci menu napravo:

| Opravneni | Nastavte na |
|---|---|
| **Contents** | **Read and write** |
| **Actions** | **Read and write** |

Vsechno ostatni nechte na **No access**.

- **Contents: Read and write** -- aby mohl system zapisovat zmeny do kodu
- **Actions: Read and write** -- aby se mohl spoustet automaticky workflow

### Krok 2.5 -- Vytvorte token

Sjedte na konec stranky a kliknete na zelene tlacitko **Generate token** (dole na strance).

### Krok 2.6 -- DULEZITE: Zkopirujte token

Na dalsi strance se objevi vas novy token. Vypada nejak takto:

```
github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**POZOR: Tento token uvidite POUZE JEDNOU. Jakmile stranku opustite nebo zavrete, uz ho nikdy znovu nezobrazite.**

Co udelat:
1. Kliknete na ikonku kopirovaciho ctverecku napravo od tokenu (nebo ho oznacte mysi a stisknete Ctrl+C)
2. Otevrete na pocitaci Poznamkovy blok (Notepad) a vlozte ho tam (Ctrl+V)
3. Soubor si docasne ulozte -- token budete potrebovat v dalsich krocich na dvou mistech
4. **Az budete hotovi s celym navodem, tento docasny soubor smazte** -- token je jako heslo, nemelte ho nechat volne lezet

---

## 3. Nastaveni GitHub Secrets

GitHub Secrets jsou bezpecne ulozene tajne hodnoty (hesla, klice), ktere pouziva automaticky system. Nikdo je po ulozeni nemuze precist -- ani vy. Muzete je jen prepsat novymi.

### Secret c. 1: GH_PAT

#### Krok 3.1 -- Otevrete nastaveni repozitare

Otevrete tuto adresu:

```
https://github.com/Erozaxx/chleba-objednavky/settings/secrets/actions
```

Pokud vidite chybu "404" nebo prazdnou stranku, zkontrolujte, ze jste prihlaseni jako **Erozaxx**.

#### Krok 3.2 -- Pridejte novy secret

1. Kliknete na zelene tlacitko **New repository secret** (v pravem hornim rohu stranky)
2. Do pole **Name** napiste (presne, velkymi pismeny): `GH_PAT`
3. Do pole **Secret** vlozte token, ktery jste si zkopirovali v kroku 2.6 (Ctrl+V)
4. Kliknete na zelene tlacitko **Add secret** (dole)

Uvidite, ze se `GH_PAT` objevil v seznamu secretu. Hotovo, prvni secret je ulozeny.

### Secret c. 2: ANTHROPIC_API_KEY

Tento klic pouziva umela inteligence (Claude od firmy Anthropic) k tomu, aby mohla zpracovavat vase pozadavky na zmenu vzhledu.

#### Krok 3.3 -- Ziskejte Anthropic API klic

1. Otevrete v prohlizeci:

```
https://console.anthropic.com/settings/keys
```

2. Pokud jeste nemate ucet u Anthropic, budete se muset zaregistrovat a pridat platebni udaje (zmeny vzhledu neco stoji -- priblizne 0.01-0.05 USD za jednu zmenu)
3. Na strance **API Keys** kliknete na tlacitko **Create Key** (nebo **+ Create Key**)
4. Jako nazev zadejte napr. `chleba-ui-agent`
5. Zobrazeny klic (zacina na `sk-ant-...`) si zkopirujte -- opet ho uvidite **pouze jednou**

#### Krok 3.4 -- Ulozte Anthropic klic do GitHub Secrets

1. Vradte se na:

```
https://github.com/Erozaxx/chleba-objednavky/settings/secrets/actions
```

2. Kliknete na zelene tlacitko **New repository secret**
3. Do pole **Name** napiste (presne, velkymi pismeny): `ANTHROPIC_API_KEY`
4. Do pole **Secret** vlozte klic z Anthropic (ten, co zacina na `sk-ant-...`)
5. Kliknete na zelene tlacitko **Add secret**

Nyni byste v seznamu secretu meli videt dve polozky: `GH_PAT` a `ANTHROPIC_API_KEY`.

---

## 4. Nastaveni Vercel env variable

Vas web bezi na Vercelu. Admin stranka na webu potrebuje token GH_PAT k tomu, aby mohla poslat pozadavek na GitHub a spustit automaticky workflow.

### Krok 4.1 -- Otevrete nastaveni projektu na Vercelu

Otevrete tuto adresu:

```
https://vercel.com/dashboard
```

Prihlaste se, pokud jeste nejste prihlaseni.

### Krok 4.2 -- Najdete svuj projekt

Na dashboardu uvidite sve projekty. Kliknete na projekt **chleba-objednavky** (nebo jak se u vas jmenuje -- muze to byt trochu jiny nazev).

### Krok 4.3 -- Prejdete do nastaveni

1. V horni liste kliknete na **Settings** (ozubene kolecko, obvykle uplne napravo v nabidce)
2. V levem postrannim menu kliknete na **Environment Variables**

### Krok 4.4 -- Pridejte promennou GH_PAT

Na strance uvidite formular pro pridani nove promenne:

1. Do pole **Key** napiste: `GH_PAT`
2. Do pole **Value** vlozte ten samy token z kroku 2.6 (ten co zacina `github_pat_...`)
3. V sekci **Environment** (prostredi) se ujistete, ze jsou zaskrtnute vsechny tri: **Production**, **Preview** a **Development** (obvykle jsou zaskrtnute automaticky)
4. Kliknete na tlacitko **Save**

Hotovo. Vercel nyni vi, jak se pripojit ke GitHubu pro spousteni workflow.

---

## 5. Prvni test -- rucni spusteni workflow

Ted overime, ze vse funguje. Spustime workflow rucne primo z GitHubu.

### Krok 5.1 -- Otevrete Actions tab

Otevrete tuto adresu:

```
https://github.com/Erozaxx/chleba-objednavky/actions
```

### Krok 5.2 -- Vyberte workflow

V levem postrannim menu uvidite nazev **UI Agent**. Kliknete na nej.

Pokud v levem menu **nic nevidite**, znamena to, ze soubor `.github/workflows/ui-agent.yml` jeste neni v hlavni vetvi repozitare (main). Nejprve je potreba ho tam dostat (mergem nebo pushnutim). Pokud tam soubor je a pesto nic nevidite, zkuste stranku obnovit (F5).

### Krok 5.3 -- Spustte workflow

1. Na strance uvidite sedy banner s textem "This workflow has a workflow_dispatch event trigger" a napravo modre tlacitko **Run workflow**
2. Kliknete na **Run workflow** -- rozbali se maly formular
3. V poli **Branch** nechte `main`
4. Do pole **UI change prompt** napiste neco jednoducheho pro test, napriklad:

```
Zvetsi hlavni nadpis na uvodni strance o 2px
```

5. Pole **Action type** nechte na `change`
6. Kliknete na zelene tlacitko **Run workflow** (uvnitr rozbaleneho formulare)

### Krok 5.4 -- Sledujte prubeh

Po kliknuti se formular zavren a v seznamu se objevi novy radek s oranzovou teckou (bezici workflow). Kliknete na nej, abyste videli detaily.

Uvidite kroky:
1. **Checkout repo** -- stahuje kod
2. **Run UI Agent** -- umela inteligence provadi zmenu
3. **Build validation** -- overuje, ze zmena nerozbila web
4. **Commit and push changes** -- ulozi zmenu a posle ji na GitHub

Cely proces trva obvykle 1-3 minuty.

### Krok 5.5 -- Jak poznat vysledek

- **Zelena fajfka** u kazdeho kroku = vse probehlo v poradku. Web se behem par minut automaticky aktualizuje na Vercelu.
- **Cerveny krizek** = neco selhalo. Viz nize, co delat.

### Co delat, kdyz vidite cerveny krizek

1. Kliknete na krok, ktery selhal (ma cerveny krizek)
2. Rozbali se log (textovy vypis) -- posledni radky obvykle rikaji, co se pokazilo
3. Nejcastejsi priciny:
   - **"Bad credentials" nebo "401"** -- token GH_PAT je spatny nebo vyprsely. Vytvorte novy (cely postup od kroku 2.1) a aktualizujte secret v kroku 3.2 (misto "New repository secret" kliknete na GH_PAT v seznamu a pak na tlacitko **Update**)
   - **"Build failed"** -- umela inteligence udelala zmenu, ktera rozbila kod. Nic se nestalo, zmena se neuplatnila. Zkuste pozadavek preformulovat jednodusseji.
   - **"Resource not accessible by integration"** -- token nema spravna opravneni. Zkontrolujte krok 2.4 (Contents a Actions musi byt Read and write)

---

## 6. Test pres formular na admin strance

Kdyz rucni test prosel, muzete vyzkouset to same pohodlneji -- primo z admin stranky vaseho webu.

### Krok 6.1 -- Otevrete admin stranku

Otevrete svuj web a prejdete do administrace. V menu najdete polozku **Vzhled webu** a kliknete na ni.

(Presna adresa je neco jako `https://vas-web.vercel.app/admin/VAS_ADMIN_TOKEN/request` -- pouzijte svuj skutecny admin token.)

### Krok 6.2 -- Zadejte pozadavek

1. Do velkeho textoveho pole napiste, co chcete zmenit, napriklad:

```
Zmenit barvu hlavniho tlacitka Objednat na tmavsi hnedou
```

2. Kliknete na tlacitko **Odeslat zmenu**

### Krok 6.3 -- Co se bude dit

- Stranka ukaze, ze se pozadavek zpracovava
- V pozadi se spusti stejny workflow na GitHubu, ktery jste testovali v kroku 5
- Po 1-3 minutach se dozvite vysledek
- Pokud vse probehne v poradku, muzete kliknout na odkaz pro zobrazeni zmenenej stranky

### Krok 6.4 -- Jak zmenu vratit

Pokud se vam vysledek nelibi:
1. Na strance **Vzhled webu** v sekci **Posledni zmeny** najdete posledni zmenu
2. Kliknete na **Vratit zmenu**
3. Potvrdite v dialogu
4. Web se vrati do predchoziho stavu -- zadna data se neztrati

---

## 7. Neco se pokazilo? (FAQ)

### Workflow se vubec nespusti

**Priznak:** Po odeslani z admin stranky se nic nedeje, zadny novy radek v GitHub Actions.

**Priciny a reseni:**
- **GH_PAT neni nastaven ve Vercelu** -- zkontrolujte krok 4 (Vercel Environment Variables). Po pridani promenne je potreba udelat **redeploy**: Vercel dashboard --> projekt --> Deployments --> tri tecky u posledniho deploye --> Redeploy.
- **Token vyprsely** -- vytvorte novy token (krok 2) a aktualizujte ho vsude: GitHub Secrets (krok 3.2) i Vercel (krok 4.4 -- existujici promennou smazte a vytvorte novou).
- **Workflow soubor neni v hlavni vetvi** -- overite, ze soubor `.github/workflows/ui-agent.yml` existuje ve vetvi `main`. Otevrete: `https://github.com/Erozaxx/chleba-objednavky/blob/main/.github/workflows/ui-agent.yml` -- pokud vidite obsah souboru, je to v poradku.

### Build selze (cerveny krizek u "Build validation")

**Priznak:** Workflow se spusti, AI udela zmenu, ale build selze.

**Priciny a reseni:**
- Umela inteligence udelala zmenu, ktera kod rozbila. **To je normalni a nic se nestalo** -- zmena se nepropise na web, protoze commit se neprovede.
- Zkuste pozadavek preformulovat -- napiste presneji, co chcete zmenit. Napr. misto "Udelej to hezci" napiste "Zvetsi pismo nadpisu na 24px a zmen barvu na #5C3D2E".

### Vercel se neaktualizuje (web vypada porad stejne)

**Priznak:** Workflow prosel (zelena fajfka), ale na webu se nic nezmenilo.

**Priciny a reseni:**
- **Cache prohlizece** -- stisknete Ctrl+Shift+R (tvrdý refresh) nebo otevrete stranku v anonymnim okne (Ctrl+Shift+N v Chrome)
- **Vercel jeste nestacil deploynout** -- otevrete `https://vercel.com/dashboard`, kliknete na svuj projekt a podivejte se na **Deployments**. Posledni deploy by mel mit status "Building" nebo "Ready". Pokud tam zadny novy deploy neni, problem je v propojeni GitHubu s Vercelem.
- **Vercel neni propojeny s repozitarem** -- ve Vercel Settings --> Git by mel byt propojen repozitar `Erozaxx/chleba-objednavky`. Pokud tam neni, propojte ho.

### Claude vrati nesmysl (zmena nedava smysl)

**Priznak:** Zmena se provede, ale vysledek je uplne jiny, nez jste chteli.

**Priciny a reseni:**
- **Prompt byl prilis vagni** -- "Udelej to lip" nefunguje. Piste konkretne: "Zvetsi pismo nadpisu na 24px", "Zmen barvu pozadi hlavicky na #F5E6D3", "Pridej stinovy efekt na tlacitka".
- **Pozadavek byl mimo rozsah** -- AI muze menit jen vizualni veci (barvy, velikosti, rozlozeni). Nemuze menit funkcionalitu (objednavky, ceny, emaily).
- **Pouzijte rollback** -- pokud se zmena nepovedla, vradte ji zpet (krok 6.4) a zkuste to znovu s presnejsim popisem.

### Token vyprsely (po 90 dnech)

**Priznak:** Vsechno fungovalo a najednou prestalo. V logu vidite "Bad credentials" nebo "401".

**Reseni:**
1. Vytvorte novy token -- cely postup od kroku 2.1
2. Aktualizujte GitHub Secret: `https://github.com/Erozaxx/chleba-objednavky/settings/secrets/actions` --> kliknete na `GH_PAT` --> **Update** --> vlozte novy token --> **Update secret**
3. Aktualizujte Vercel: Vercel dashboard --> projekt --> Settings --> Environment Variables --> smazte starou `GH_PAT` --> pridejte novou se stejnym nazvem a novym tokenem
4. Na Vercelu udelejte redeploy (Deployments --> tri tecky --> Redeploy)

---

**Pokud si s necim nevite rady, klidne se ozve -- vse se da opravit.**
