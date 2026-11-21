# Plan: curățenie + interacțiune socială și gamificare

Creat: 2026-11-21. Pornit de la feedback extern: „ar putea fi dezvoltat mai mult pe partea de
interacțiune dintre utilizatori — profiluri cu statistici și recorduri personale, provocări între
utilizatori, clasamente, insigne gen First Pull-up, First Muscle-up, Handstand Master”.

Status: [ ] de făcut · [~] în lucru · [x] gata

## Ce exista deja (audit 2026-11-21)

| Idee | Există | Lipsește |
|---|---|---|
| Profil cu statistici | streak, monede, antrenamente, prieteni, skill-uri, istoric | profilul public arată puțin |
| Recorduri personale | PR repetări / exercițiu în tabul Statistici (doar profilul propriu) | PR pe profil public, PR la menținere, notificare la PR nou |
| Clasamente | clasament săptămânal pe home doar pentru flotări; puncte în comunitate; clasament la evenimente | pe exercițiu, prieteni/oraș/comunitate, all-time |
| Provocări | Battle live 1v1, Evenimente live, provocarea săptămânală, provocări de comunitate, Spiderman | provocări asincrone între prieteni |
| Insigne | insigne de nivel, „Committed” în comunitate, sarcini cu monede | sistem real de insigne câștigate; titlurile din shop se cumpără |

## Faza 0 — Curățenie

- [ ] 0.1 `community/[id]/page.tsx` (3.020 linii) are copii inline pentru TrainingCard, AddTrainingForm,
      MemberSheet, ReactorsModal, EditCommunityModal, PostCard; versiunile din `_components/` sunt
      nefolosite (PostCard are 2 variante: home vs comunitate). → o singură versiune, în `_components/`.
- [ ] 0.2 Două sisteme de skill-uri: `lib/data/skills.ts` (30, cu monede, folosit doar la obiective) și
      `lib/data/skillCategories.ts` (42, autodeclarate; trebuie să se potrivească cu Android). → unificare.
- [ ] 0.3 Battle și Eveniment aproape identice (room codes, boți, cameră, rezultate) → un singur mod „Live”.
      Spiderman → provocare obișnuită.
- [ ] 0.4 Pagini orfane: `/workout/master-coach`, `/workout/autocut` → legate în UI sau șterse.
- [ ] 0.5 `/training/[communityId]/…` și `/training/park/[parkId]/…` aproape identice → o componentă.
- [ ] 0.6 Shop: scoatem titlurile cumpărate (PRO, BEAST_MODE, IRON_WILL, CHAMPION) când există insigne;
      shop-ul rămâne pentru cosmetice (rame, culoare nume).
- [ ] 0.7 Home supraîncărcat → 3–4 secțiuni.

## Faza 1 — Insigne

- [ ] Catalog de insigne cu niveluri bronz/argint/aur.
- [ ] Acordare automată din date existente: repetări numărate de AI (First Pull-up, 10/25 tracțiuni,
      50 flotări), activitate (streak 7/30, antrenamente în parc, primul Battle câștigat), sarcinile cu monede.
- [ ] Skill-uri (Muscle-up, Handstand Master) cu dovadă video validată de un TRAINER din comunitate.
- [ ] Perete de insigne pe profil, vizibil și pe profilul public.
- [ ] Notificare + postare automată în feed la insignă nouă.

## Faza 2 — Recorduri personale

- [ ] Max repetări (tracțiuni, flotări, dipsuri) + max menținere (L-sit, handstand, plank).
- [ ] Marcaj „verificat AI” când recordul e numărat de cameră.
- [ ] Pe profilul public; record nou → feed + notificare.

## Faza 3 — „Provoacă un prieten” (asincron)

- [ ] Exercițiu + țintă sau „bate-mi recordul” + termen.
- [ ] Dovada prin numărătoarea AI; rezultat în chat și feed. Refolosește infrastructura Battle.

## Faza 4 — Pagina de clasamente

- [ ] Pe exercițiu; scope prieteni / comunitate / oraș / țară; perioadă săptămână / lună / all-time.
- [ ] Doar rezultate verificate AI. Înlocuiește widget-ul doar cu flotări de pe home.

## Faza 5 — Feed cu activitatea prietenilor

- [ ] Antrenamente, recorduri, insigne ale prietenilor, cu reacții.

## Jurnal

- 2026-11-21: plan creat.
