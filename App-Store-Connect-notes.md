# Compte de démonstration App Store — Vmail

## 1. À coller dans App Store Connect → App Review Information

**Sign-in required:** Yes

**User name**
```
demo@veille-email.fr
```

**Password** *(le champ est obligatoire — on y met le code, en l'expliquant dans les notes)*
```
48213765
```

**Notes**
```
IMPORTANT — HOW TO SIGN IN

Vmail does not use passwords. Sign-in is done with a one-time code sent by
email. For App Review, this demo account accepts a FIXED code, so you never
need to open a mailbox.

1. Open the app and tap "Sign in".
2. Enter the email address: demo@veille-email.fr
3. Tap the button to request the code.
4. Enter this 8-digit code: 48213765

The code is always the same for this account and never expires. If the screen
asks you to wait before requesting a new code, simply enter 48213765 directly.

WHAT YOU WILL SEE
The account is pre-loaded with 20 sample emails (all fictitious, @*.test
domains). They are sorted into the four Vmail categories so you can review the
full feature set:
- Urgent (2), Important (4), To answer (4), Info (7)
Three further emails are classified as Ads. By design they are excluded from the
Home screen counters and are listed in the Emails tab, under "Ads" (20 in total).
Open any email to see the AI summary, the full message, and the reply-draft
generation. The compose screen, the folders (Sent, Drafts, Archived, Deleted)
and the Settings screens are all reachable from the sidebar.

NO PURCHASES INSIDE THE APP
The app contains no purchase flow, no price, no subscription screen and no link
to any external purchase page, in line with Guideline 3.1.3(f) (free
stand-alone companion app to a paid web-based email service).

NEW USERS
If the email address entered has no Vmail account, the app opens a web page
(app.veille-email.fr/essai) where the person connects their Outlook mailbox;
the free account is created with that mailbox address. This page shows no
price, no payment method and no link other than the Microsoft sign-in; once
the mailbox is connected it sends the person straight back to the app, which
emails the sign-in code. Accounts can be deleted from inside the app
(Settings).
```

## 2. Réponse à envoyer dans le fil App Review (Guideline 2.1)

```
Hello,

Thank you for the review and for pointing out the sign-in issue.

You are right that the previous credentials could not work: Vmail has no
passwords at all. The app signs users in with a one-time code sent by email,
so a password field could never grant access.

We have set up a dedicated demo account that accepts a fixed code, so no
mailbox access is needed:

  Email: demo@veille-email.fr
  Code:  48213765

Steps: open the app, enter the email address, tap the button to receive the
code, then enter 48213765. The code is always the same for this account.

The account is pre-loaded with 20 fictitious emails covering all four sorting
categories, so the complete feature set can be reviewed: sorting, reading, AI
summary, reply drafting, composing, folders and settings.

We have also updated the App Review Information section with these details.

Thank you for your time.
```

## 3. À retenir pour plus tard

- Le code fixe repose sur un déclencheur en base, limité à la seule adresse
  `demo@veille-email.fr` (migration `vmail_demo_otp_fixe_app_store`).
- **Une fois l'app validée**, le retirer :
  ```sql
  drop trigger vmail_demo_otp_fixe_trg on auth.users;
  drop function public.vmail_demo_otp_fixe();
  ```
- Le compte `demo@veille-email.fr` a `acces_offert = true` : il ne se bloquera
  jamais à la fin d'un essai.

## 4. Parcours « nouvel utilisateur » — 17/09/2026

- Une adresse sans compte ouvre `https://app.veille-email.fr/essai` dans une
  fenêtre Safari. La page fait connecter la boîte Outlook (même inscription que
  le site) ; la page de succès n8n renvoie dans l'app par
  `veilleemailmobile://connected?email=…`, et l'app envoie le code à cette
  adresse. Outlook seulement (choix de HA du 17/09/2026).
- **Risque assumé par HA le 17/09/2026** : la règle 3.1.3(f) que ces notes
  revendiquent interdit « les appels à acheter hors de l'app ». La page n'a ni
  prix, ni paiement, ni autre lien que la connexion Microsoft ; le paragraphe « NEW USERS » ci-dessus le dit à
  Apple. Si Apple refuse sur 3.1.1 / 3.1.3, les deux vraies issues sont :
  limiter le lien aux États-Unis (autorisé là-bas) ou passer à l'achat intégré.
- iOS affiche une alerte système avant d'ouvrir la page (« Vmail souhaite
  utiliser veille-email.fr pour se connecter »). C'est normal.
