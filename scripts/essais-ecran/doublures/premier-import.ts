export type EtatPremierImport = 'inconnu' | 'non' | 'sans-boite' | 'attente' | 'trop-long';
export const usePremierImport = () => 'non' as EtatPremierImport;
