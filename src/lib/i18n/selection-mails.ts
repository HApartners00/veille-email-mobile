/**
 * SÉLECTION DE PLUSIEURS MAILS + GLISSER POUR ARCHIVER / SUPPRIMER — 09/10/2026.
 *
 * Les textes de la sélection multiple (web + app) et du glissement (app). Ce fichier
 * existe À L'IDENTIQUE dans les deux dépôts : `Veille Email/apps/web/src/lib/i18n/` et
 * `veille-email-mobile/src/lib/i18n/` (règle d'alignement web ↔ mobile de HA, 07/08).
 * Toucher l'un, toucher l'autre.
 *
 * Les libellés des opérations elles-mêmes (Archiver, Corbeille, Restaurer…) ne sont
 * PAS ici : ils viennent des dictionnaires existants des actions sur un mail, pour
 * qu'un même bouton porte le même mot partout.
 *
 * Russe et arabe : les nombres sont posés en fin de phrase (« Архивировано: 3 ») pour
 * ne pas avoir à accorder un pluriel à plusieurs formes.
 */

export type OpLot = 'archive' | 'unarchive' | 'trash' | 'untrash' | 'unspam' | 'lu' | 'nonlu';

export type TextesSelection = {
  /** « 3 sélectionnés » */
  nombre: (n: number) => string;
  tout: string;
  fermer: string;
  /** Libellé lu par le lecteur d'écran sur la case d'un mail (web). */
  selectionner: string;
  lu: string;
  nonLu: string;
  categorie: string;
  classerDans: string;
  enCours: (fait: number, total: number) => string;
  fait: (op: OpLot, n: number) => string;
  classes: (n: number, categorie: string) => string;
  /** Une partie (ou tout) n'a pas pu être traitée. `raison` = ce que la messagerie a répondu. */
  echecs: (k: number, n: number, raison: string) => string;
};

const fr: TextesSelection = {
  nombre: (n) => (n === 1 ? '1 sélectionné' : `${n} sélectionnés`),
  tout: 'Tout',
  fermer: 'Fermer la sélection',
  selectionner: 'Sélectionner',
  lu: 'Lu',
  nonLu: 'Non lu',
  categorie: 'Catégorie',
  classerDans: 'Classer dans…',
  enCours: (f, t) => `En cours… ${f}/${t}`,
  fait: (op, n) => {
    const un = n === 1;
    switch (op) {
      case 'archive': return un ? 'Mail archivé.' : `${n} mails archivés.`;
      case 'unarchive': return un ? 'Mail remis dans la boîte.' : `${n} mails remis dans la boîte.`;
      case 'trash': return un ? 'Mail mis à la corbeille.' : `${n} mails mis à la corbeille.`;
      case 'untrash': return un ? 'Mail restauré.' : `${n} mails restaurés.`;
      case 'unspam': return un ? 'Mail sorti des indésirables.' : `${n} mails sortis des indésirables.`;
      case 'lu': return un ? 'Marqué comme lu.' : `${n} mails marqués comme lus.`;
      case 'nonlu': return un ? 'Marqué comme non lu.' : `${n} mails marqués comme non lus.`;
    }
  },
  classes: (n, c) => (n === 1 ? `Classé dans « ${c} ».` : `${n} mails classés dans « ${c} ».`),
  echecs: (k, n, r) => (n === 1 ? `Action impossible : ${r}` : k === 1 ? `1 sur ${n} n’a pas pu être traité : ${r}` : `${k} sur ${n} n’ont pas pu être traités : ${r}`),
};

const en: TextesSelection = {
  nombre: (n) => `${n} selected`,
  tout: 'All',
  fermer: 'Close selection',
  selectionner: 'Select',
  lu: 'Read',
  nonLu: 'Unread',
  categorie: 'Category',
  classerDans: 'Move to…',
  enCours: (f, t) => `Working… ${f}/${t}`,
  fait: (op, n) => {
    const m = n === 1 ? 'Email' : `${n} emails`;
    switch (op) {
      case 'archive': return `${m} archived.`;
      case 'unarchive': return `${m} moved back to the inbox.`;
      case 'trash': return `${m} moved to the trash.`;
      case 'untrash': return `${m} restored.`;
      case 'unspam': return `${m} removed from spam.`;
      case 'lu': return `${m} marked as read.`;
      case 'nonlu': return `${m} marked as unread.`;
    }
  },
  classes: (n, c) => `${n === 1 ? 'Email' : `${n} emails`} moved to “${c}”.`,
  echecs: (k, n, r) => (n === 1 ? `Couldn’t do it: ${r}` : `${k} of ${n} couldn’t be processed: ${r}`),
};

const es: TextesSelection = {
  nombre: (n) => (n === 1 ? '1 seleccionado' : `${n} seleccionados`),
  tout: 'Todos',
  fermer: 'Cerrar la selección',
  selectionner: 'Seleccionar',
  lu: 'Leído',
  nonLu: 'No leído',
  categorie: 'Categoría',
  classerDans: 'Clasificar en…',
  enCours: (f, t) => `En curso… ${f}/${t}`,
  fait: (op, n) => {
    const un = n === 1;
    switch (op) {
      case 'archive': return un ? 'Correo archivado.' : `${n} correos archivados.`;
      case 'unarchive': return un ? 'Correo devuelto a la bandeja.' : `${n} correos devueltos a la bandeja.`;
      case 'trash': return un ? 'Correo enviado a la papelera.' : `${n} correos enviados a la papelera.`;
      case 'untrash': return un ? 'Correo restaurado.' : `${n} correos restaurados.`;
      case 'unspam': return un ? 'Correo sacado de spam.' : `${n} correos sacados de spam.`;
      case 'lu': return un ? 'Marcado como leído.' : `${n} correos marcados como leídos.`;
      case 'nonlu': return un ? 'Marcado como no leído.' : `${n} correos marcados como no leídos.`;
    }
  },
  classes: (n, c) => (n === 1 ? `Clasificado en «${c}».` : `${n} correos clasificados en «${c}».`),
  echecs: (k, n, r) => (n === 1 ? `No se pudo hacer: ${r}` : k === 1 ? `1 de ${n} no se pudo procesar: ${r}` : `${k} de ${n} no se pudieron procesar: ${r}`),
};

const de: TextesSelection = {
  nombre: (n) => `${n} ausgewählt`,
  tout: 'Alle',
  fermer: 'Auswahl schließen',
  selectionner: 'Auswählen',
  lu: 'Gelesen',
  nonLu: 'Ungelesen',
  categorie: 'Kategorie',
  classerDans: 'Verschieben nach…',
  enCours: (f, t) => `Läuft… ${f}/${t}`,
  fait: (op, n) => {
    const m = n === 1 ? 'E-Mail' : `${n} E-Mails`;
    switch (op) {
      case 'archive': return `${m} archiviert.`;
      case 'unarchive': return `${m} zurück in den Posteingang.`;
      case 'trash': return `${m} in den Papierkorb verschoben.`;
      case 'untrash': return `${m} wiederhergestellt.`;
      case 'unspam': return `${m} aus Spam entfernt.`;
      case 'lu': return `${m} als gelesen markiert.`;
      case 'nonlu': return `${m} als ungelesen markiert.`;
    }
  },
  classes: (n, c) => `${n === 1 ? 'E-Mail' : `${n} E-Mails`} nach „${c}“ verschoben.`,
  echecs: (k, n, r) => (n === 1 ? `Nicht möglich: ${r}` : k === 1 ? `1 von ${n} konnte nicht bearbeitet werden: ${r}` : `${k} von ${n} konnten nicht bearbeitet werden: ${r}`),
};

const pt: TextesSelection = {
  nombre: (n) => (n === 1 ? '1 selecionado' : `${n} selecionados`),
  tout: 'Todos',
  fermer: 'Fechar a seleção',
  selectionner: 'Selecionar',
  lu: 'Lido',
  nonLu: 'Não lido',
  categorie: 'Categoria',
  classerDans: 'Classificar em…',
  enCours: (f, t) => `Em curso… ${f}/${t}`,
  fait: (op, n) => {
    const un = n === 1;
    switch (op) {
      case 'archive': return un ? 'Email arquivado.' : `${n} emails arquivados.`;
      case 'unarchive': return un ? 'Email devolvido à caixa.' : `${n} emails devolvidos à caixa.`;
      case 'trash': return un ? 'Email enviado para o lixo.' : `${n} emails enviados para o lixo.`;
      case 'untrash': return un ? 'Email restaurado.' : `${n} emails restaurados.`;
      case 'unspam': return un ? 'Email retirado do spam.' : `${n} emails retirados do spam.`;
      case 'lu': return un ? 'Marcado como lido.' : `${n} emails marcados como lidos.`;
      case 'nonlu': return un ? 'Marcado como não lido.' : `${n} emails marcados como não lidos.`;
    }
  },
  classes: (n, c) => (n === 1 ? `Classificado em «${c}».` : `${n} emails classificados em «${c}».`),
  echecs: (k, n, r) => (n === 1 ? `Não foi possível: ${r}` : k === 1 ? `1 de ${n} não pôde ser tratado: ${r}` : `${k} de ${n} não puderam ser tratados: ${r}`),
};

const it: TextesSelection = {
  nombre: (n) => (n === 1 ? '1 selezionato' : `${n} selezionati`),
  tout: 'Tutti',
  fermer: 'Chiudi la selezione',
  selectionner: 'Seleziona',
  lu: 'Letto',
  nonLu: 'Non letto',
  categorie: 'Categoria',
  classerDans: 'Classifica in…',
  enCours: (f, t) => `In corso… ${f}/${t}`,
  fait: (op, n) => {
    const un = n === 1;
    switch (op) {
      case 'archive': return un ? 'Email archiviata.' : `${n} email archiviate.`;
      case 'unarchive': return un ? 'Email rimessa nella casella.' : `${n} email rimesse nella casella.`;
      case 'trash': return un ? 'Email spostata nel cestino.' : `${n} email spostate nel cestino.`;
      case 'untrash': return un ? 'Email ripristinata.' : `${n} email ripristinate.`;
      case 'unspam': return un ? 'Email tolta dallo spam.' : `${n} email tolte dallo spam.`;
      case 'lu': return un ? 'Segnata come letta.' : `${n} email segnate come lette.`;
      case 'nonlu': return un ? 'Segnata come non letta.' : `${n} email segnate come non lette.`;
    }
  },
  classes: (n, c) => (n === 1 ? `Classificata in «${c}».` : `${n} email classificate in «${c}».`),
  echecs: (k, n, r) => (n === 1 ? `Impossibile: ${r}` : k === 1 ? `1 su ${n} non è stata elaborata: ${r}` : `${k} su ${n} non sono state elaborate: ${r}`),
};

const ar: TextesSelection = {
  nombre: (n) => `المحدد: ${n}`,
  tout: 'الكل',
  fermer: 'إغلاق التحديد',
  selectionner: 'تحديد',
  lu: 'مقروء',
  nonLu: 'غير مقروء',
  categorie: 'الفئة',
  classerDans: 'نقل إلى…',
  enCours: (f, t) => `جارٍ التنفيذ… ${f}/${t}`,
  fait: (op, n) => {
    switch (op) {
      case 'archive': return `تمت الأرشفة: ${n}`;
      case 'unarchive': return `أُعيد إلى صندوق الوارد: ${n}`;
      case 'trash': return `نُقل إلى المهملات: ${n}`;
      case 'untrash': return `تمت الاستعادة: ${n}`;
      case 'unspam': return `أُخرج من البريد المزعج: ${n}`;
      case 'lu': return `عُلِّم كمقروء: ${n}`;
      case 'nonlu': return `عُلِّم كغير مقروء: ${n}`;
    }
  },
  classes: (n, c) => `نُقل إلى «${c}»: ${n}`,
  echecs: (k, n, r) => (n === 1 ? `تعذّر التنفيذ: ${r}` : `تعذّرت معالجة ${k} من ${n}: ${r}`),
};

const ru: TextesSelection = {
  nombre: (n) => `Выбрано: ${n}`,
  tout: 'Все',
  fermer: 'Закрыть выбор',
  selectionner: 'Выбрать',
  lu: 'Прочитано',
  nonLu: 'Не прочитано',
  categorie: 'Категория',
  classerDans: 'Переместить в…',
  enCours: (f, t) => `Выполняется… ${f}/${t}`,
  fait: (op, n) => {
    switch (op) {
      case 'archive': return `В архиве: ${n}`;
      case 'unarchive': return `Возвращено во входящие: ${n}`;
      case 'trash': return `Перемещено в корзину: ${n}`;
      case 'untrash': return `Восстановлено: ${n}`;
      case 'unspam': return `Убрано из спама: ${n}`;
      case 'lu': return `Отмечено как прочитанное: ${n}`;
      case 'nonlu': return `Отмечено как непрочитанное: ${n}`;
    }
  },
  classes: (n, c) => `Перемещено в «${c}»: ${n}`,
  echecs: (k, n, r) => (n === 1 ? `Не удалось: ${r}` : `Не удалось обработать ${k} из ${n}: ${r}`),
};

export const selectionMsg: Record<string, TextesSelection> = { fr, en, es, de, pt, it, ar, ru };

export function textesSelection(locale: string | null | undefined): TextesSelection {
  return selectionMsg[(locale || '').slice(0, 2)] ?? en;
}
