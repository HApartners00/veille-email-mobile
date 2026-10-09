// Fausse base : la table `items` est `etat.items` ; chaque lecture compte (pour voir les relectures).
const g = globalThis as any;
export const etat: { items: any[]; lectures: number } = g.__base || (g.__base = { items: [], lectures: 0 });
function requete(table: string) {
  const r: any = {
    select() { return r; }, order() { return r; }, range() { return r; }, or() { return r; }, in() { return r; }, eq() { return r; },
    update() { return r; }, insert() { return Promise.resolve({ error: null }); },
    then(ok: any, ko: any) {
      if (table === 'items') { etat.lectures++; return Promise.resolve({ data: etat.items.map((x) => ({ ...x, tags: [...x.tags] })), error: null }).then(ok, ko); }
      return Promise.resolve({ data: [], error: null }).then(ok, ko);
    },
  };
  return r;
}
export const supabase = { from: (t: string) => requete(t) };
