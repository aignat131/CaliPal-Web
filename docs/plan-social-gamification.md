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

- [x] 0.1 `community/[id]/page.tsx` (3.020 linii) are copii inline pentru TrainingCard, AddTrainingForm,
      MemberSheet, ReactorsModal, EditCommunityModal, PostCard; versiunile din `_components/` sunt
      nefolosite (PostCard are 2 variante: home vs comunitate). → o singură versiune, în `_components/`.
- [ ] 0.2 Două sisteme de skill-uri: `lib/data/skills.ts` (30, cu monede, folosit doar la obiective) și
      `lib/data/skillCategories.ts` (42, autodeclarate; trebuie să se potrivească cu Android). → unificare.
- [ ] 0.3 Battle și Eveniment aproape identice (room codes, boți, cameră, rezultate) → un singur mod „Live”.
      Spiderman → provocare obișnuită.
- [~] 0.4 Pagini orfane: `/workout/autocut` șters. `/workout/master-coach` păstrat: fluxul video + revizuire
      antrenor e baza pentru validarea insignelor de skill (încă nelegat în UI).
- [ ] 0.5 `/training/[communityId]/…` și `/training/park/[parkId]/…` aproape identice → o componentă.
- [ ] 0.6 Shop: scoatem titlurile cumpărate (PRO, BEAST_MODE, IRON_WILL, CHAMPION) când există insigne;
      shop-ul rămâne pentru cosmetice (rame, culoare nume).
- [ ] 0.7 Home supraîncărcat → 3–4 secțiuni.

## Faza 1 — Insigne

- [x] Catalog de insigne cu niveluri bronz/argint/aur (21 insigne, `lib/gamification/badges.ts`).
- [x] Acordare automată din date existente: repetări numărate de AI (First Pull-up, 10/25 tracțiuni,
      50 flotări), activitate (streak 7/30, antrenamente în parc, primul Battle câștigat), sarcinile cu monede.
- [ ] Skill-uri cu dovadă video validată de un TRAINER (acum Muscle-up/Handstand se acordă din seturile salvate;
      validarea video ar putea refolosi fluxul Master Coach).
- [x] Perete de insigne pe profil (tab „Insigne”) și pe profilul public.
- [x] Notificare + postare în feed-ul prietenilor la insignă nouă.

## Faza 2 — Recorduri personale

- [x] Max repetări (tracțiuni, flotări, dips, squat, muscle-up) + max menținere (handstand, L-sit, plank, front lever, dead hang).
- [x] Marcaj „verificat AI” când recordul e numărat de cameră.
- [x] Pe profilul public; record nou → feed + notificare.

## Faza 3 — „Provoacă un prieten” (asincron)

- [x] Exercițiu + țintă (implicit „bate-mi recordul”) + termen 3/7/14 zile. Doar între prieteni.
- [x] Se bifează automat la salvarea unui antrenament care atinge ținta; notificări + feed. (Nu în chat.)

## Faza 4 — Pagina de clasamente

- [~] Pe exercițiu; scope toți / prieteni / comunitate. Lipsesc: oraș, perioade (săptămână/lună) pe recorduri.
- [~] Filtru „doar verificate AI” (opțional, nu obligatoriu). Widget-ul de flotări de pe home era deja ascuns.

## Faza 5 — Feed cu activitatea prietenilor

- [x] Recorduri, insigne, provocări reușite ale prietenilor pe home, cu 👏. (Nu și antrenamente simple.)

## Jurnal

- 2026-11-21: plan creat.
- 2026-11-21 (seara): 0.1, 0.4 parțial, fazele 1, 2, 3, 5 și 4 parțial. Date noi: `users/{uid}/badges`,
  `user_records/{uid}`, `challenges`, `activity` (+ index `activity(uid, createdAt desc)`); workout-urile au acum
  `backdated: true`. **Regulile și indexul trebuie deploy-ate** (`firebase deploy --only firestore:rules,firestore:indexes`).
  Rămase: 0.2, 0.3, 0.5, 0.6, 0.7, validare video skill-uri, clasamente pe oraș/perioadă.
